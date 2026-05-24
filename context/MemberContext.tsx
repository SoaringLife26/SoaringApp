import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db } from '../firebaseConfig';

type PrivateGlider = {
  displayName: string;
  contestNumber: string;
  nNumber: string;
  make: string;
  model: string;
  isTwoSeat: boolean;
};

type Member = {
  uid: string;
  displayName: string;
  memberNumber: string;
  email: string;
  membershipStatus: string;
  isOnNoTowList: boolean;
  isTowPilotQualified: boolean;
  isTowPilotCurrent: boolean;
  isCFIQualified: boolean;
  isCFICurrent: boolean;
  isRideGiverAuthorized: boolean;
  isYouthMember: boolean;
  privateGlider: PrivateGlider | null;
};

type MemberContextType = {
  member: Member | null;
  user: User | null;
  loading: boolean;
};

const MemberContext = createContext<MemberContextType>({
  member: null,
  user: null,
  loading: true,
});

export function MemberProvider({ children }: { children: React.ReactNode }) {
  const [member, setMember] = useState<Member | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        try {
        const memberDoc = await getDoc(
            doc(db, 'members', firebaseUser.uid)
          );

          if (memberDoc.exists()) {
            const data = memberDoc.data();
            setMember({
              uid: firebaseUser.uid,
              displayName: data.displayName || '',
              memberNumber: data.memberNumber || '',
              email: data.email || firebaseUser.email || '',
              membershipStatus: data.membershipStatus || 'Active',
              isOnNoTowList: data.isOnNoTowList || false,
              isTowPilotQualified: data.isTowPilotQualified || false,
              isTowPilotCurrent: data.isTowPilotCurrent || false,
              isCFIQualified: data.isCFIQualified || false,
              isCFICurrent: data.isCFICurrent || false,
              isRideGiverAuthorized: data.isRideGiverAuthorized || false,
              isYouthMember: data.isYouthMember || false,
              privateGlider: data.privateGlider || null,
            });
          } else {
            setMember(null);
          }
        } catch (error) {
          console.error('Error fetching member:', error);
          setMember(null);
        }
      } else {
        setMember(null);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  return (
    <MemberContext.Provider value={{ member, user, loading }}>
      {children}
    </MemberContext.Provider>
  );
}

export function useMember() {
  return useContext(MemberContext);
}