import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  orderBy,
  getDocs,
  writeBatch,
  runTransaction,
  Timestamp,
} from 'firebase/firestore';

// Same billing increment as the rest of the app (a tenth of an hour, 6
// minutes) — reused here as the landing-time reconciliation tolerance.
const LANDING_TOLERANCE_MIN = 6;

import { db } from '../firebaseConfig';
import { useMember } from '../context/MemberContext';
import { useGlobalSettings } from '../context/GlobalSettingsContext';
import { grantClearance, ClearanceReason } from '../lib/currency';

const REASON_OPTIONS: { id: ClearanceReason; label: string; requiresNote: boolean }[] = [
  { id: 'instructor_flight', label: 'Flying with an instructor', requiresNote: false },
  { id: 'waived_experienced', label: 'Waived — experienced pilot', requiresNote: true },
  { id: 'waived_verified_elsewhere', label: 'Waived — verified current at another club', requiresNote: true },
];

function getCardColor(flight: any) {
  if (flight.flightCategory === 'aero_retrieve') return '#FCE4EC';
  if (!flight.lineChiefPresent) return '#E3F2FD';
  if (flight.gliderOwnership === 'private' ||
      flight.gliderOwnership === 'private_other') return '#FFF8E1';
  if (flight.isDemoRide) return '#E8F5E9';
  return '#FFFFFF';
}

function getTimeAloft(takeoffMillis: number | null, now: number) {
  if (!takeoffMillis) return '';
  const minutes = Math.floor((now - takeoffMillis) / 60000);
  if (minutes < 1) return '<1 min';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function LineChiefScreen({ navigation }: any) {
  const { member } = useMember();
  const { lineChiefMode, activeTowPlaneId, activeLineChiefUID, activeLineChiefName } = useGlobalSettings();
  const [claimingLineChief, setClaimingLineChief] = useState(false);

  const [pendingFlights, setPendingFlights] = useState<any[]>([]);
  const [airborneFlights, setAirborneFlights] = useState<any[]>([]);
  const [towPlanes, setTowPlanes] = useState<any[]>([]);
  const [clearanceRequests, setClearanceRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  const [expandedFlightId, setExpandedFlightId] = useState<string | null>(null);
  const [landingProposedTime, setLandingProposedTime] = useState<Date | null>(null);
  const [landingOffset, setLandingOffset] = useState(0);

  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);
  const [selectedReason, setSelectedReason] = useState<ClearanceReason | null>(null);
  const [reasonNote, setReasonNote] = useState('');
  const [grantingClearance, setGrantingClearance] = useState(false);

  // Live "time aloft" on airborne cards — ticks without any Firestore reads.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchTowPlanes = async () => {
      try {
        const snapshot = await getDocs(
          query(collection(db, 'towPlanes'), where('isActive', '==', true))
        );
        setTowPlanes(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error('Error fetching tow planes:', error);
      }
    };
    fetchTowPlanes();
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, 'flights'),
      where('status', 'in', ['pending', 'certified']),
      orderBy('queuePosition', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPendingFlights(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    // 'landed' is included too — when the pilot logs landing first, status
    // goes straight to 'landed' (see MyTicketScreen), but the LC still
    // needs to see it to independently confirm/reconcile. Once the LC has
    // done that (landingConfirmedBy set), it drops off this list — nothing
    // left here for the LC to do.
    const q = query(collection(db, 'flights'), where('status', 'in', ['airborne', 'landing_proposed', 'landed']));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const flights = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((f: any) => f.status !== 'landed' || !f.landingConfirmedBy);
      setAirborneFlights(flights);
    });
    return unsubscribe;
  }, []);

  // Currency clearance requests — Section 15.4. Any active member can read
  // and resolve these today (firestore.rules); see spec Section 15.7 for
  // the open item on gating Line Chief access itself.
  useEffect(() => {
    const q = query(
      collection(db, 'currencyClearanceRequests'),
      where('status', '==', 'pending')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setClearanceRequests(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsubscribe;
  }, []);

  const handleCertify = async (flight: any, towPlaneId: string) => {
    if (!towPlaneId) {
      Alert.alert('Required', 'Please select a tow plane');
      return;
    }
    const towPlane = towPlanes.find(p => p.id === towPlaneId);
    try {
      await updateDoc(doc(db, 'flights', flight.id), {
        status: 'certified',
        towPlaneId,
        towPlaneNNumber: towPlane?.nNumber || '',
        towPlaneDisplayName: towPlane?.displayName || '',
        certifiedByLineChiefId: member?.uid,
        certifiedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      Alert.alert('Error', 'Could not certify flight.');
    }
  };

  const handleWheelsUp = async (flight: any) => {
    Alert.alert(
      'Confirm Takeoff',
      `Log wheels up for ${flight.displayShorthand}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'WHEELS UP',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'flights', flight.id), {
                status: 'airborne',
                takeoffTime: serverTimestamp(),
                lineChiefPresent: true,
                updatedAt: serverTimestamp(),
              });
            } catch (error) {
              Alert.alert('Error', 'Could not log takeoff.');
            }
          },
        },
      ]
    );
  };

  const handleMoveUp = async (flight: any) => {
    const index = pendingFlights.findIndex(f => f.id === flight.id);
    if (index <= 0) return;
    try {
      const above = pendingFlights[index - 1];
      await updateDoc(doc(db, 'flights', flight.id), {
        queuePosition: above.queuePosition,
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'flights', above.id), {
        queuePosition: flight.queuePosition,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      Alert.alert('Error', 'Could not reorder queue.');
    }
  };

  const handleMoveDown = async (flight: any) => {
    const index = pendingFlights.findIndex(f => f.id === flight.id);
    if (index >= pendingFlights.length - 1) return;
    try {
      const below = pendingFlights[index + 1];
      await updateDoc(doc(db, 'flights', flight.id), {
        queuePosition: below.queuePosition,
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'flights', below.id), {
        queuePosition: flight.queuePosition,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      Alert.alert('Error', 'Could not reorder queue.');
    }
  };

  // Drag-and-drop reorder (Section 6.9) — the whole visible order is
  // renumbered and committed as one batched write on drop, not per frame
  // during the drag, so the live onSnapshot listener isn't fighting the
  // gesture mid-drag. Up/Down (above) remain for precise single-position
  // moves.
  const handleDragEnd = async ({ data }: { data: any[] }) => {
    setPendingFlights(data);
    try {
      const batch = writeBatch(db);
      data.forEach((flight, index) => {
        batch.update(doc(db, 'flights', flight.id), {
          queuePosition: index,
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
    } catch (error) {
      Alert.alert('Error', 'Could not save new queue order.');
    }
  };

  const handleClaimLineChief = async () => {
    setClaimingLineChief(true);
    try {
      await updateDoc(doc(db, 'globalSettings', 'current'), {
        activeLineChiefUID: member?.uid,
        activeLineChiefName: member?.displayName,
        activeLineChiefClaimedAt: serverTimestamp(),
      });
    } catch (error) {
      Alert.alert('Error', 'Could not sign on as Line Chief.');
    } finally {
      setClaimingLineChief(false);
    }
  };

  const handleTakeOverLineChief = () => {
    Alert.alert(
      'Take Over as Line Chief',
      `${activeLineChiefName || 'Another member'} is currently signed on as Line Chief. Take over?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Take Over', style: 'destructive', onPress: handleClaimLineChief },
      ]
    );
  };

  const handleTapAirborneCard = (flightId: string) => {
    if (expandedFlightId === flightId) {
      setExpandedFlightId(null);
      setLandingProposedTime(null);
      setLandingOffset(0);
      return;
    }
    // Always start from "now", even if the pilot already self-reported a
    // time — this has to be the LC's own independent observation for the
    // tolerance check to mean anything. Pre-filling from the pilot's time
    // would make every confirmation trivially match it (delta always 0).
    setExpandedFlightId(flightId);
    setLandingProposedTime(new Date());
    setLandingOffset(0);
  };

  const handleConfirmLanding = async (flight: any) => {
    if (!landingProposedTime) return;
    let mismatchResult: { deltaMin: number; needsReconciliation: boolean } | null = null;
    try {
      const adjustedTime = new Date(landingProposedTime.getTime() + landingOffset * 60000);
      const adjustedTimestamp = Timestamp.fromDate(adjustedTime);
      const flightRef = doc(db, 'flights', flight.id);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(flightRef);
        const current = snap.data();
        const towSideDone = !!current?.releaseAltitudeFt || !!current?.patternTowConfirmed;
        const pilotSideDone = current?.gliderOwnership !== 'club' || !!current?.pilotFlightTime;

        if (current?.pilotLandingTime) {
          // Pilot already logged their own landing — this LC entry is the
          // independent check, not a fresh proposal. LC's time is treated
          // as canonical for billing either way; a mismatch beyond
          // tolerance just gets flagged, never blocks the flight from
          // proceeding.
          const deltaMin = Math.abs(adjustedTime.getTime() - current.pilotLandingTime.toMillis()) / 60000;
          mismatchResult = { deltaMin, needsReconciliation: deltaMin > LANDING_TOLERANCE_MIN };
          transaction.update(flightRef, {
            lineChiefLandingTime: adjustedTimestamp,
            landingTime: adjustedTimestamp,
            landingTimeOffsetMin: landingOffset,
            landingConfirmedBy: 'line_chief',
            landingConfirmedAt: serverTimestamp(),
            needsReconciliation: deltaMin > LANDING_TOLERANCE_MIN,
            reconciliationDeltaMin: deltaMin,
            status: towSideDone && pilotSideDone ? 'complete' : 'landed',
            updatedAt: serverTimestamp(),
          });
        } else {
          // LC logging first — propose to the pilot for accept/decline
          // rather than finalizing immediately.
          transaction.update(flightRef, {
            lineChiefLandingTime: adjustedTimestamp,
            landingTime: adjustedTimestamp,
            landingTimeOffsetMin: landingOffset,
            landingLoggedBy: 'line_chief',
            status: 'landing_proposed',
            updatedAt: serverTimestamp(),
          });
        }
      });
      setExpandedFlightId(null);
      setLandingProposedTime(null);
      setLandingOffset(0);
      // Immediate feedback on the reconciliation result, since it otherwise
      // only surfaces later on the End of Day screen.
      if (mismatchResult) {
        const { deltaMin, needsReconciliation } = mismatchResult as { deltaMin: number; needsReconciliation: boolean };
        if (needsReconciliation) {
          Alert.alert(
            'Landing Time Mismatch',
            `Your entry is ${Math.round(deltaMin)} min off the pilot's — outside the ${LANDING_TOLERANCE_MIN} min tolerance. Flagged for End of Day review; nothing is blocked.`
          );
        } else {
          Alert.alert('Landing Confirmed', `Matches the pilot's reported time within tolerance (~${Math.round(deltaMin)} min).`);
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Could not log landing.');
    }
  };

  const handleTapClearanceCard = (requestId: string) => {
    if (expandedRequestId === requestId) {
      setExpandedRequestId(null);
      setSelectedReason(null);
      setReasonNote('');
      return;
    }
    setExpandedRequestId(requestId);
    setSelectedReason(null);
    setReasonNote('');
  };

  const handleGrantClearance = async (request: any) => {
    if (!selectedReason) {
      Alert.alert('Required', 'Please select a reason.');
      return;
    }
    const reasonMeta = REASON_OPTIONS.find(r => r.id === selectedReason);
    if (reasonMeta?.requiresNote && !reasonNote.trim()) {
      Alert.alert('Required', 'Please add a note for this reason.');
      return;
    }
    setGrantingClearance(true);
    try {
      await grantClearance(request.id, member?.uid || '', selectedReason, reasonNote.trim() || null);
      setExpandedRequestId(null);
      setSelectedReason(null);
      setReasonNote('');
    } catch (error) {
      Alert.alert('Error', 'Could not grant clearance.');
    } finally {
      setGrantingClearance(false);
    }
  };

  const getTowTypeBadge = (towType: string) => {
    const badges: Record<string, string> = {
      normal:        'Normal',
      pattern:       '⚡ Pattern',
      box_wake:      '📦 Box Wake',
      slack_line:    '〰️ Slack Line',
      tow_rope_fail: '✂️ Rope Fail',
      other:         '📝 Other',
    };
    return badges[towType] || towType;
  };

  // Only one person can hold the Line Chief role at a time. If someone else
  // already has it, block entry behind a takeover prompt rather than letting
  // two people act as LC simultaneously with no coordination.
  if (activeLineChiefUID && activeLineChiefUID !== member?.uid) {
    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Line Chief</Text>
        <View style={styles.gateCard}>
          <Text style={styles.gateText}>
            📋 {activeLineChiefName || 'Another member'} is currently signed on as Line Chief
          </Text>
          <TouchableOpacity
            style={styles.gateButton}
            onPress={handleTakeOverLineChief}
            disabled={claimingLineChief}>
            <Text style={styles.gateButtonText}>
              {claimingLineChief ? 'Taking over...' : 'Take Over as Line Chief'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!activeLineChiefUID) {
    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Line Chief</Text>
        <View style={styles.gateCard}>
          <Text style={styles.gateText}>No one is currently signed on as Line Chief.</Text>
          <TouchableOpacity
            style={styles.gateButton}
            onPress={handleClaimLineChief}
            disabled={claimingLineChief}>
            <Text style={styles.gateButtonText}>
              {claimingLineChief ? 'Signing on...' : 'Become Line Chief'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Line Chief</Text>
      <Text style={styles.subtitle}>{member?.displayName}</Text>

      {!lineChiefMode && (
        <View style={styles.noLCBanner}>
          <Text style={styles.noLCBannerText}>✈️ No Line Chief Mode Active</Text>
          <Text style={styles.noLCBannerSubtext}>
            Queue is read-only. Pilots are self-logging.
          </Text>
        </View>
      )}

      {clearanceRequests.length > 0 && (
        <View style={styles.clearanceSection}>
          <Text style={styles.clearanceSectionTitle}>
            ⚠️ Currency Clearance Needed ({clearanceRequests.length})
          </Text>
          {clearanceRequests.map((request) => {
            const expanded = expandedRequestId === request.id;
            const detail = (request.daysSinceLastFlight === null || request.daysSinceLastFlight === undefined)
              ? 'No flight on record'
              : `${request.daysSinceLastFlight} days since last flight`;

            if (!expanded) {
              return (
                <TouchableOpacity
                  key={request.id}
                  style={styles.clearanceCardCompact}
                  onPress={() => handleTapClearanceCard(request.id)}>
                  <Text style={styles.clearanceCardName}>{request.pilotName}</Text>
                  <Text style={styles.clearanceCardDetail}>{detail}</Text>
                </TouchableOpacity>
              );
            }

            const reasonMeta = REASON_OPTIONS.find(r => r.id === selectedReason);

            return (
              <View key={request.id} style={styles.clearanceCardExpanded}>
                <Text style={styles.clearanceCardName}>{request.pilotName}</Text>
                <Text style={styles.clearanceCardDetail}>{detail}</Text>
                {REASON_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.id}
                    style={[styles.reasonButton, selectedReason === option.id && styles.reasonButtonSelected]}
                    onPress={() => setSelectedReason(option.id)}>
                    <Text style={[styles.reasonButtonText, selectedReason === option.id && styles.reasonButtonTextSelected]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
                {reasonMeta?.requiresNote && (
                  <TextInput
                    style={styles.reasonNoteInput}
                    placeholder="Note (required for this reason)"
                    value={reasonNote}
                    onChangeText={setReasonNote}
                    multiline
                  />
                )}
                <TouchableOpacity
                  style={styles.grantButton}
                  onPress={() => handleGrantClearance(request)}
                  disabled={grantingClearance}>
                  <Text style={styles.grantButtonText}>
                    {grantingClearance ? 'Granting...' : 'Grant Clearance for Today'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleTapClearanceCard(request.id)}>
                  <Text style={styles.clearanceCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}

      {/* Split pane — Pending Queue (top, weighted larger) / Airborne (bottom) */}
      <View style={styles.splitContainer}>
        <View style={styles.queuePane}>
          <Text style={styles.sectionTitle}>📋 Pending Queue ({pendingFlights.length})</Text>
          {loading ? (
            <ActivityIndicator size="large" color="#1A4E8C" style={{ marginTop: 40 }} />
          ) : pendingFlights.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No pending tow requests</Text>
            </View>
          ) : (
            <DraggableFlatList
              data={pendingFlights}
              keyExtractor={(item: any) => item.id}
              onDragEnd={handleDragEnd}
              contentContainerStyle={{ paddingBottom: 20 }}
              renderItem={({ item, drag, isActive, getIndex }: RenderItemParams<any>) => {
                const index = getIndex() ?? 0;
                return (
                  <ScaleDecorator>
                    <FlightCard
                      flight={item}
                      towPlanes={towPlanes}
                      activeTowPlaneId={activeTowPlaneId}
                      onCertify={handleCertify}
                      onWheelsUp={handleWheelsUp}
                      getTowTypeBadge={getTowTypeBadge}
                      onMoveUp={handleMoveUp}
                      onMoveDown={handleMoveDown}
                      isFirst={index === 0}
                      isLast={index === pendingFlights.length - 1}
                      onDragHandleLongPress={drag}
                      isDragging={isActive}
                    />
                  </ScaleDecorator>
                );
              }}
            />
          )}
        </View>

        <View style={styles.airbornePane}>
          <Text style={styles.sectionTitle}>✈️ Airborne ({airborneFlights.length})</Text>
          {airborneFlights.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No gliders airborne</Text>
            </View>
          ) : (
            <FlatList
              data={airborneFlights}
              keyExtractor={(item: any) => item.id}
              contentContainerStyle={{ paddingBottom: 20 }}
              renderItem={({ item }) => {
                const expanded = expandedFlightId === item.id;
                const aloft = getTimeAloft(item.takeoffTime?.toMillis?.() ?? null, now);

                const awaitingPilot = item.status === 'landing_proposed' && item.landingLoggedBy === 'line_chief';
                const pilotReported = !!item.pilotLandingTime && item.status !== 'landing_proposed';

                if (!expanded) {
                  return (
                    <TouchableOpacity
                      style={[styles.airborneCardCompact, { backgroundColor: getCardColor(item) }]}
                      onPress={() => handleTapAirborneCard(item.id)}>
                      <Text style={styles.airborneGlider}>{item.displayShorthand}</Text>
                      <Text style={styles.airborneTimeAloft}>{aloft}</Text>
                      {awaitingPilot && (
                        <Text style={styles.landingRaceBadge}>⏳ Awaiting pilot confirmation</Text>
                      )}
                      {pilotReported && (
                        <Text style={styles.landingRaceBadge}>🛬 Pilot reported landed — confirm</Text>
                      )}
                    </TouchableOpacity>
                  );
                }

                return (
                  <View style={[styles.airborneCardExpanded, { backgroundColor: getCardColor(item) }]}>
                    <Text style={styles.airborneGlider}>{item.displayShorthand}</Text>
                    <Text style={styles.airborneTimeAloft}>Aloft {aloft}</Text>
                    {awaitingPilot && (
                      <Text style={styles.landingRaceBadge}>⏳ Awaiting pilot confirmation</Text>
                    )}
                    {pilotReported && (
                      <Text style={styles.landingRaceBadge}>🛬 Pilot reported landed — confirm</Text>
                    )}
                    {landingProposedTime && (
                      <>
                        <Text style={styles.adjustRecorded}>
                          Recorded: {landingProposedTime.toLocaleTimeString()}
                        </Text>
                        <Text style={styles.adjustLabel}>Adjust if you tapped late or early:</Text>
                        <View style={styles.adjustButtons}>
                          {[-5, -3, -1, 0, 1, 3, 5].map((offset) => (
                            <TouchableOpacity
                              key={offset}
                              style={[styles.adjustButton, landingOffset === offset && styles.adjustButtonSelected]}
                              onPress={() => setLandingOffset(offset)}>
                              <Text style={[styles.adjustButtonText, landingOffset === offset && styles.adjustButtonTextSelected]}>
                                {offset === 0 ? '0' : offset > 0 ? `+${offset}` : `${offset}`}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        {landingOffset !== 0 && (
                          <Text style={styles.adjustResult}>
                            Final time: {new Date(landingProposedTime.getTime() + landingOffset * 60000).toLocaleTimeString()}
                          </Text>
                        )}
                        <View style={styles.adjustConfirmRow}>
                          <TouchableOpacity
                            style={styles.adjustCancelButton}
                            onPress={() => handleTapAirborneCard(item.id)}>
                            <Text style={styles.adjustCancelText}>Cancel</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.adjustConfirmButton}
                            onPress={() => handleConfirmLanding(item)}>
                            <Text style={styles.adjustConfirmText}>🛬 Confirm Landing</Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                  </View>
                );
              }}
            />
          )}
        </View>
      </View>

      <TouchableOpacity
        style={styles.endOfDayButton}
        onPress={() => navigation.navigate('EndOfDay')}>
        <Text style={styles.endOfDayText}>📋 End of Day Checklist</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

function FlightCard({
  flight, towPlanes, activeTowPlaneId, onCertify, onWheelsUp, getTowTypeBadge,
  onMoveUp, onMoveDown, isFirst, isLast, onDragHandleLongPress, isDragging,
}: any) {
  const [selectedTowPlane, setSelectedTowPlane] = useState('');

  useEffect(() => {
    if (activeTowPlaneId) {
      setSelectedTowPlane(activeTowPlaneId);
    } else if (towPlanes.length === 1) {
      setSelectedTowPlane(towPlanes[0].id);
    }
  }, [towPlanes, activeTowPlaneId]);

  return (
    <View style={[styles.flightCard, { backgroundColor: getCardColor(flight) }, isDragging && styles.flightCardDragging]}>
      <TouchableOpacity
        style={styles.dragHandle}
        onLongPress={onDragHandleLongPress}
        delayLongPress={150}>
        <Text style={styles.dragHandleText}>⠿⠿ Hold to reorder</Text>
      </TouchableOpacity>

      <Text style={styles.flightGlider}>{flight.displayShorthand}</Text>
      <Text style={styles.flightAltitude}>
        {flight.requestedAltitudeFt?.toLocaleString()} ft AGL
      </Text>
      <Text style={styles.flightType}>{getTowTypeBadge(flight.towType)}</Text>

      <View style={styles.badgeRow}>
        {flight.studentFlight && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>STUDENT</Text>
          </View>
        )}
        {flight.isDual && flight.studentFlight && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>DUAL</Text>
          </View>
        )}
        {flight.hasPassenger && (
          <View style={[styles.badge, styles.badgePassenger]}>
            <Text style={styles.badgeText}>PASSENGER</Text>
          </View>
        )}
        {flight.isDemoRide && (
          <View style={[styles.badge, styles.badgeDemoRide]}>
            <Text style={styles.badgeText}>DEMO RIDE</Text>
          </View>
        )}
        {flight.flownWhileNotCurrent && (
          <View style={[styles.badge, styles.badgeCurrency]}>
            <Text style={styles.badgeText}>NOT CURRENT</Text>
          </View>
        )}
      </View>

      {flight.status === 'pending' && (
        <>
          <Text style={styles.towPlaneLabel}>
            {towPlanes.length === 1 ? 'Tow Plane' : 'Select Tow Plane'}
          </Text>
          {towPlanes.length === 1 ? (
            <View style={styles.autoTowPlane}>
              <Text style={styles.autoTowPlaneText}>
                ✅ {towPlanes[0].displayName || towPlanes[0].nNumber}
              </Text>
            </View>
          ) : (
            <View style={styles.towPlaneRow}>
              {towPlanes.map((plane: any) => (
                <TouchableOpacity
                  key={plane.id}
                  style={[
                    styles.towPlaneButton,
                    selectedTowPlane === plane.id && styles.towPlaneSelected,
                  ]}
                  onPress={() => setSelectedTowPlane(plane.id)}>
                  <Text style={[
                    styles.towPlaneText,
                    selectedTowPlane === plane.id && styles.towPlaneTextSelected,
                  ]}>
                    {plane.displayName || plane.nNumber}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.certifyButton,
              !selectedTowPlane && styles.certifyButtonDisabled,
            ]}
            onPress={() => onCertify(flight, selectedTowPlane)}
            disabled={!selectedTowPlane}>
            <Text style={styles.certifyText}>Certify — Cleared for Tow</Text>
          </TouchableOpacity>
        </>
      )}

      {flight.status === 'certified' && (
        <View>
          <Text style={styles.certifiedTag}>
            ✅ Certified — {flight.towPlaneDisplayName || flight.towPlaneNNumber}
          </Text>
          <TouchableOpacity
            style={styles.wheelsUpButton}
            onPress={() => onWheelsUp(flight)}>
            <Text style={styles.wheelsUpText}>⬆️ WHEELS UP</Text>
          </TouchableOpacity>
        </View>
      )}

      {flight.status === 'pending' && (
        <View style={styles.reorderRow}>
          <Text style={styles.reorderLabel}>Move in queue:</Text>
          <TouchableOpacity
            style={[styles.reorderButton, isFirst && styles.reorderButtonDisabled]}
            onPress={() => !isFirst && onMoveUp(flight)}
            disabled={isFirst}>
            <Text style={styles.reorderButtonText}>▲ Up</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.reorderButton, isLast && styles.reorderButtonDisabled]}
            onPress={() => !isLast && onMoveDown(flight)}
            disabled={isLast}>
            <Text style={styles.reorderButtonText}>▼ Down</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f4f8',
    paddingHorizontal: 24,
    paddingTop: 44,
  },
  backButton: {
    marginBottom: 4,
  },
  backText: {
    fontSize: 14,
    color: '#1A4E8C',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A4E8C',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
  },
  gateCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    marginTop: 16,
    alignItems: 'center',
  },
  gateText: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
    marginBottom: 20,
  },
  gateButton: {
    backgroundColor: '#1A4E8C',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
  },
  gateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  noLCBanner: {
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: '#FF9800',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  noLCBannerText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#E65100',
    marginBottom: 2,
  },
  noLCBannerSubtext: {
    fontSize: 13,
    color: '#BF360C',
  },
  endOfDayButton: {
    backgroundColor: '#1A4E8C',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  endOfDayText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  clearanceSection: {
    marginBottom: 12,
  },
  clearanceSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#E65100',
    marginBottom: 8,
  },
  clearanceCardCompact: {
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: '#FF9800',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clearanceCardExpanded: {
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: '#FF9800',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  clearanceCardName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
  },
  clearanceCardDetail: {
    fontSize: 13,
    color: '#888',
  },
  reasonButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  reasonButtonSelected: {
    backgroundColor: '#1A4E8C',
    borderColor: '#1A4E8C',
  },
  reasonButtonText: {
    fontSize: 14,
    color: '#333',
  },
  reasonButtonTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  reasonNoteInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    minHeight: 50,
    fontSize: 14,
  },
  grantButton: {
    backgroundColor: '#2E7D32',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  grantButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  clearanceCancelText: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 10,
  },
  splitContainer: {
    flex: 1,
  },
  queuePane: {
    flex: 3,
    marginBottom: 8,
  },
  airbornePane: {
    flex: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A4E8C',
    marginBottom: 8,
  },
  emptyState: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: '#999',
  },
  airborneCardCompact: {
    borderWidth: 1,
    borderColor: '#1A4E8C',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  airborneGlider: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1A4E8C',
  },
  airborneTimeAloft: {
    fontSize: 14,
    color: '#555',
    fontWeight: '600',
  },
  landingRaceBadge: {
    fontSize: 12,
    color: '#9C27B0',
    fontWeight: '600',
    marginTop: 4,
  },
  airborneCardExpanded: {
    borderWidth: 1,
    borderColor: '#1A4E8C',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  adjustRecorded: {
    fontSize: 14,
    color: '#555',
    marginTop: 8,
    marginBottom: 4,
  },
  adjustLabel: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
  },
  adjustButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  adjustButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 44,
    alignItems: 'center',
  },
  adjustButtonSelected: {
    backgroundColor: '#1A4E8C',
    borderColor: '#1A4E8C',
  },
  adjustButtonText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
  },
  adjustButtonTextSelected: {
    color: '#fff',
  },
  adjustResult: {
    fontSize: 14,
    color: '#1A4E8C',
    fontWeight: '600',
    marginBottom: 8,
  },
  adjustConfirmRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  adjustCancelButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  adjustCancelText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
  adjustConfirmButton: {
    flex: 2,
    backgroundColor: '#1A4E8C',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  adjustConfirmText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  dragHandle: {
    alignSelf: 'flex-start',
    backgroundColor: '#f0f4f8',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 8,
  },
  dragHandleText: {
    fontSize: 11,
    color: '#999',
  },
  flightCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  flightCardDragging: {
    opacity: 0.6,
    borderColor: '#1A4E8C',
    borderWidth: 2,
  },
  flightGlider: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A4E8C',
    marginBottom: 4,
  },
  flightAltitude: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  flightType: {
    fontSize: 14,
    color: '#555',
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  badge: {
    backgroundColor: '#1A4E8C',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgePassenger: {
    backgroundColor: '#FF9800',
  },
  badgeDemoRide: {
    backgroundColor: '#2E7D32',
  },
  badgeCurrency: {
    backgroundColor: '#C62828',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  towPlaneLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  autoTowPlane: {
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  autoTowPlaneText: {
    fontSize: 15,
    color: '#2E7D32',
    fontWeight: '600',
  },
  towPlaneRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  towPlaneButton: {
    backgroundColor: '#f0f4f8',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  towPlaneSelected: {
    backgroundColor: '#1A4E8C',
    borderColor: '#1A4E8C',
  },
  towPlaneText: {
    fontSize: 14,
    color: '#333',
  },
  towPlaneTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  certifyButton: {
    backgroundColor: '#2E7D32',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  certifyButtonDisabled: {
    backgroundColor: '#bbb',
  },
  certifyText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  certifiedTag: {
    fontSize: 14,
    color: '#2E7D32',
    fontWeight: '600',
    marginBottom: 10,
  },
  wheelsUpButton: {
    backgroundColor: '#E65100',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  wheelsUpText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  reorderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  reorderLabel: {
    fontSize: 12,
    color: '#888',
    flex: 1,
  },
  reorderButton: {
    backgroundColor: '#f0f4f8',
    borderWidth: 1,
    borderColor: '#1A4E8C',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  reorderButtonDisabled: {
    borderColor: '#ddd',
    backgroundColor: '#f9f9f9',
  },
  reorderButtonText: {
    fontSize: 12,
    color: '#1A4E8C',
    fontWeight: '600',
  },
});
