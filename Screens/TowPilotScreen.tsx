import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
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
  getDoc,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useMember } from '../context/MemberContext';

export default function TowPilotScreen({ navigation }: any) {
  const { member } = useMember();
  const [pendingFlights, setPendingFlights] = useState<any[]>([]);
  const [completedTow, setCompletedTow] = useState<any>(null);
  const [releaseAltitude, setReleaseAltitude] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
 const [towPlanes, setTowPlanes] = useState<any[]>([]);
  const [selectedTowPlane, setSelectedTowPlane] = useState<any>(null);
  const [towPlanesLoading, setTowPlanesLoading] = useState(true);
  const [lineChiefMode, setLineChiefMode] = useState(true);
  const [togglingMode, setTogglingMode] = useState(false);

  // Real-time listener for pending flights
  useEffect(() => {
    const q = query(
      collection(db, 'flights'),
      where('status', 'in', ['pending', 'certified']),
      orderBy('queuePosition', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const flights = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
      setPendingFlights(flights);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

 // Real-time listener for recently landed flights needing release altitude
  useEffect(() => {
    const q = query(
      collection(db, 'flights'),
      where('status', '==', 'landed')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const landedFlights = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((f: any) => !f.releaseAltitudeFt && !f.patternTowConfirmed);

      if (landedFlights.length > 0) {
        setCompletedTow(landedFlights[0]);
      } else {
        setCompletedTow(null);
      }
    });


    
    return unsubscribe;
  }, []);

  // Fetch active tow planes for session selection
  useEffect(() => {
    const fetchTowPlanes = async () => {
      try {
        const snapshot = await getDocs(
          query(collection(db, 'towPlanes'), where('isActive', '==', true))
        );
        const planes = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data(),
        }));
        console.log('Tow planes found:', planes.length);
        setTowPlanes(planes);
      } catch (error) {
        console.error('Error fetching tow planes:', error);
      } finally {
        setTowPlanesLoading(false);
      }
    };
    fetchTowPlanes();
  }, []);

  // Real-time listener for global settings
  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'globalSettings', 'current'),
      (snapshot) => {
        console.log('globalSettings exists:', snapshot.exists());
        console.log('globalSettings data:', JSON.stringify(snapshot.data()));
        if (snapshot.exists()) {
          setLineChiefMode(snapshot.data().lineChiefMode ?? true);
        }
      }
    );
    return unsubscribe;
  }, []);

const handleModeToggle = async () => {
    setTogglingMode(true);
    try {
      await updateDoc(doc(db, 'globalSettings', 'current'), {
        lineChiefMode: !lineChiefMode,
        modeChangedAt: serverTimestamp(),
        modeChangedByUID: member?.uid,
      });
    } catch (error: any) {
      Alert.alert('Error', error?.message || String(error));
    } finally {
      setTogglingMode(false);
    }
  };

  const handleReleaseAltitude = async () => {
    if (!releaseAltitude) {
      Alert.alert('Required', 'Please enter the release altitude');
      return;
    }
    if (!completedTow) return;

    setSubmitting(true);
    try {
      await updateDoc(doc(db, 'flights', completedTow.id), {
        releaseAltitudeFt: parseInt(releaseAltitude),
        towPilotUID: member?.uid,
        towPilotName: member?.displayName,
        status: 'complete',
        updatedAt: serverTimestamp(),
      });
      setCompletedTow(null);
      setReleaseAltitude('');
      Alert.alert('Logged', 'Release altitude recorded.');
    } catch (error) {
      Alert.alert('Error', 'Could not save release altitude.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePatternTowConfirm = async () => {
    if (!completedTow) return;
    setSubmitting(true);
    try {
      await updateDoc(doc(db, 'flights', completedTow.id), {
        patternTowConfirmed: true,
        patternTowConfirmedAt: serverTimestamp(),
        towPilotUID: member?.uid,
        towPilotName: member?.displayName,
        billedFlightTime: 0.1,
        reconciled: true,
        reconciliationMethod: 'pattern_tow_fixed',
        updatedAt: serverTimestamp(),
      });

await updateDoc(doc(db, 'flights', completedTow.id), {
        patternTowConfirmed: true,
        patternTowConfirmedAt: serverTimestamp(),
        towPilotUID: member?.uid,
        towPilotName: member?.displayName,
        billedFlightTime: 0.1,
        reconciled: true,
        reconciliationMethod: 'pattern_tow_fixed',
        status: 'complete',
        updatedAt: serverTimestamp(),
      });

      Alert.alert('Confirmed', 'Pattern tow recorded. Billed at 0.1 hr.');
    } catch (error) {
      Alert.alert('Error', 'Could not confirm pattern tow.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTowComplete = async (flight: any) => {
    try {
      await updateDoc(doc(db, 'flights', flight.id), {
        status: 'landed',
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      Alert.alert('Error', 'Could not update flight status.');
    }
  };

  const getCardColor = (flight: any) => {
    if (flight.flightCategory === 'aero_retrieve') return '#FCE4EC';
    if (!flight.lineChiefPresent) return '#E3F2FD';
    if (flight.gliderOwnership === 'private' ||
        flight.gliderOwnership === 'private_other') return '#FFF8E1';
    if (flight.isDemoRide) return '#E8F5E9';
    return '#FFFFFF';
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

  // Tow plane selection gate
  if (!selectedTowPlane) {
    return (
      <ScrollView style={styles.container}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Tow Pilot</Text>
        <Text style={styles.pilotName}>{member?.displayName}</Text>
        <Text style={styles.sectionTitle}>Select Your Tow Plane</Text>
        <Text style={styles.gateSubtitle}>
          Choose the aircraft you are flying today
        </Text>

        {towPlanesLoading ? (
          <ActivityIndicator size="large" color="#1A4E8C" style={{ marginTop: 40 }} />
        ) : (
          towPlanes.map((plane) => (
            <TouchableOpacity
              key={plane.id}
              style={styles.towPlaneGateButton}
              onPress={async () => {
                setSelectedTowPlane(plane);
                try {
                  await updateDoc(doc(db, 'globalSettings', 'current'), {
                    activeTowPlaneId: plane.id,
                    activeTowPlaneNNumber: plane.nNumber,
                    activeTowPlaneDisplayName: plane.displayName || plane.nNumber,
                    activeTowPilotUID: member?.uid,
                    activeTowPilotName: member?.displayName,
                  });
                } catch (error) {
                  console.error('Could not update active tow plane:', error);
                }
              }}>
              <Text style={styles.towPlaneGateName}>
                {plane.displayName || plane.nNumber}
              </Text>
              <Text style={styles.towPlaneGateDetail}>
                {plane.make} {plane.model} — {plane.nNumber}
              </Text>
            </TouchableOpacity>
          ))
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Tow Pilot</Text>
      <Text style={styles.pilotName}>{member?.displayName}</Text>

      {/* Persistent tow plane header */}
      <View style={styles.towPlaneHeader}>
        <Text style={styles.towPlaneHeaderText}>
          ✈️ Flying: {selectedTowPlane.displayName || selectedTowPlane.nNumber} — {selectedTowPlane.nNumber}
        </Text>
        <TouchableOpacity onPress={() => setSelectedTowPlane(null)}>
          <Text style={styles.changePlaneText}>Change</Text>
        </TouchableOpacity>
      </View>

      {/* Line chief mode toggle */}
      <TouchableOpacity
        style={[
          styles.modeToggle,
          lineChiefMode ? styles.modeToggleOn : styles.modeToggleOff,
        ]}
        onPress={handleModeToggle}
        disabled={togglingMode}>
        <Text style={styles.modeToggleText}>
          {lineChiefMode ? '👤 Line Chief Mode: With Line Chief' : '✈️ Line Chief Mode: Without Line Chief'}
        </Text>
        <Text style={styles.modeToggleSubtext}>
          {lineChiefMode ? 'Tap to switch to without line chief' : 'Tap to switch to with line chief'}
        </Text>
      </TouchableOpacity>

      {/* Completed tow card */}
      {completedTow && (
      <View style={[styles.completedCard, { backgroundColor: getCardColor(completedTow) }]}>
          <Text style={styles.completedTitle}>
            ✅ Tow Complete — Enter Altitude
          </Text>
          <Text style={styles.completedGlider}>
            {completedTow.displayShorthand}
          </Text>
          <Text style={styles.completedBadge}>
            {getTowTypeBadge(completedTow.towType)}
          </Text>

          {completedTow.towType === 'pattern' ? (
            <TouchableOpacity
              style={styles.patternButton}
              onPress={handlePatternTowConfirm}
              disabled={submitting}>
              <Text style={styles.patternButtonText}>
                {submitting ? 'Confirming...' : 'Confirm Pattern Tow'}
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              <Text style={styles.inputLabel}>Release Altitude (ft AGL)</Text>
              <TextInput
                style={styles.altInput}
                placeholder="e.g. 2500"
                value={releaseAltitude}
                onChangeText={setReleaseAltitude}
                keyboardType="numeric"
              />
              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleReleaseAltitude}
                disabled={submitting}>
                <Text style={styles.submitText}>
                  {submitting ? 'Saving...' : 'Log Release Altitude'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* Incoming tow briefs */}
      <Text style={styles.sectionTitle}>Incoming Tow Briefs</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#1A4E8C" style={{ marginTop: 40 }} />
      ) : pendingFlights.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No pending tow requests</Text>
        </View>
      ) : (
        pendingFlights.map((flight) => (
          <View key={flight.id} style={[styles.briefCard, { backgroundColor: getCardColor(flight) }]}>
            <Text style={styles.briefGlider}>
              {flight.displayShorthand}
            </Text>
            <Text style={styles.briefAltitude}>
              {flight.requestedAltitudeFt?.toLocaleString()} ft AGL
            </Text>
            <Text style={styles.briefTowType}>
              {getTowTypeBadge(flight.towType)}
            </Text>
            {flight.towTypeNote && (
              <Text style={styles.briefNote}>Note: {flight.towTypeNote}</Text>
            )}
            <View style={styles.badgeRow}>
              {flight.isDemoRide && (
              <View style={[styles.badge, styles.badgeDemoRide]}>
                <Text style={styles.badgeText}>DEMO RIDE</Text>
              </View>
            )}
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
            </View>
            <TouchableOpacity
              style={styles.towCompleteButton}
              onPress={() => handleTowComplete(flight)}>
              <Text style={styles.towCompleteText}>Tow Complete</Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f4f8',
    padding: 24,
  },
  backButton: {
    marginTop: 60,
    marginBottom: 8,
  },
  backText: {
    fontSize: 16,
    color: '#1A4E8C',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A4E8C',
    marginBottom: 4,
  },
  pilotName: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
  },
  completedCard: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#4CAF50',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  completedTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginBottom: 8,
  },
  completedGlider: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1A4E8C',
    marginBottom: 4,
  },
  completedBadge: {
    fontSize: 14,
    color: '#555',
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  altInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 14,
    fontSize: 18,
    marginBottom: 12,
  },
  submitButton: {
    backgroundColor: '#1A4E8C',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  patternButton: {
    backgroundColor: '#FF9800',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  patternButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A4E8C',
    marginBottom: 16,
  },
  emptyState: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  briefCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#1A4E8C',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  briefGlider: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A4E8C',
    marginBottom: 4,
  },
  briefAltitude: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  briefTowType: {
    fontSize: 16,
    color: '#555',
    marginBottom: 8,
  },
  briefNote: {
    fontSize: 14,
    color: '#888',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
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
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },

  towCompleteButton: {
    backgroundColor: '#2E7D32',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  towCompleteText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },

gateSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  towPlaneGateButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#1A4E8C',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  towPlaneGateName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1A4E8C',
    marginBottom: 4,
  },
  towPlaneGateDetail: {
    fontSize: 14,
    color: '#666',
  },
  towPlaneHeader: {
    backgroundColor: '#1A4E8C',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  towPlaneHeaderText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  changePlaneText: {
    color: '#90CAF9',
    fontSize: 13,
  },

  modeToggle: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  modeToggleOn: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  modeToggleOff: {
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: '#FF9800',
  },
  modeToggleText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
  },
  modeToggleSubtext: {
    fontSize: 12,
    color: '#666',
  },
badgeDemoRide: {
    backgroundColor: '#2E7D32',
  },

});

