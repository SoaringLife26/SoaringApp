import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';

// Club rule: a pilot must have flown a glider — club, private, or another
// member's — within this many days to fly or rent a club glider.
export const CURRENCY_WINDOW_DAYS = 90;

export type ClearanceReason =
  | 'instructor_flight'
  | 'waived_experienced'
  | 'waived_verified_elsewhere';

function todayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

// Most recent flight where this pilot was airborne (club, private, or
// borrowed glider — any gliderOwnership counts), regardless of their role
// in that flight (solo, dual, student). Returns null if they have no
// qualifying flight on record in this app at all.
export async function getDaysSinceLastFlight(pilotId: string): Promise<number | null> {
  const q = query(
    collection(db, 'flights'),
    where('pilotId', '==', pilotId),
    where('status', 'in', ['landed', 'complete']),
    orderBy('landingTime', 'desc'),
    limit(1)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  const landingTime = snapshot.docs[0].data().landingTime as Timestamp | undefined;
  if (!landingTime) return null;

  const diffMs = Date.now() - landingTime.toDate().getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function isCurrent(daysSinceLastFlight: number | null): boolean {
  return daysSinceLastFlight !== null && daysSinceLastFlight <= CURRENCY_WINDOW_DAYS;
}

// A Line Chief clearance is only good for the day it was granted — see
// Section 15.4 of the spec. It does not change the underlying currency
// computation; it just unblocks submission for today.
export async function hasActiveClearance(pilotId: string): Promise<boolean> {
  const q = query(
    collection(db, 'currencyClearanceRequests'),
    where('pilotId', '==', pilotId),
    where('status', '==', 'granted'),
    where('grantedForDate', '==', todayDateString()),
    limit(1)
  );
  const snapshot = await getDocs(q);
  return !snapshot.empty;
}

async function hasPendingClearanceRequest(pilotId: string): Promise<boolean> {
  const q = query(
    collection(db, 'currencyClearanceRequests'),
    where('pilotId', '==', pilotId),
    where('status', '==', 'pending'),
    limit(1)
  );
  const snapshot = await getDocs(q);
  return !snapshot.empty;
}

// Called when a lapsed pilot is blocked from submitting — files the request
// the Line Chief screen's live "Currency Clearance Needed" list picks up.
// A no-op if one is already pending, so re-tapping the blocked role doesn't
// spam duplicate requests.
export async function fileClearanceRequest(
  pilotId: string,
  pilotName: string,
  daysSinceLastFlight: number | null
): Promise<void> {
  if (await hasPendingClearanceRequest(pilotId)) return;
  await addDoc(collection(db, 'currencyClearanceRequests'), {
    pilotId,
    pilotName,
    requestedAt: serverTimestamp(),
    daysSinceLastFlight,
    status: 'pending',
    reason: null,
    reasonNote: null,
    grantedByUID: null,
    grantedAt: null,
    grantedForDate: null,
  });
}

// Line Chief action — resolves a pending request for today only.
export async function grantClearance(
  requestId: string,
  grantedByUID: string,
  reason: ClearanceReason,
  reasonNote: string | null
): Promise<void> {
  await updateDoc(doc(db, 'currencyClearanceRequests', requestId), {
    status: 'granted',
    grantedByUID,
    grantedAt: serverTimestamp(),
    reason,
    reasonNote,
    grantedForDate: todayDateString(),
  });
}
