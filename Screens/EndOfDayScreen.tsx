import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
  getDocs,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useMember } from '../context/MemberContext';

// A tenth of an hour is 6 minutes — always round up, never down, per club billing rules.
function computeSystemFlightTime(flight: any): number | null {
  if (!flight.takeoffTime || !flight.landingTime) return null;
  const minutes = (flight.landingTime.toMillis() - flight.takeoffTime.toMillis()) / 60000;
  if (minutes <= 0) return null;
  return Math.ceil(minutes / 6) / 10;
}

export default function EndOfDayScreen({ navigation }: any) {
  const { member } = useMember();
  const [allFlights, setAllFlights] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [closingDay, setClosingDay] = useState(false);
  const [closingNote, setClosingNote] = useState('');
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [clearFlightTimes, setClearFlightTimes] = useState<Record<string, string>>({});

  // Get today's date range
  const getTodayRange = () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return { start, end };
  };

  // Real-time listener for today's flights
  useEffect(() => {
    const { start } = getTodayRange();

    const q = query(
      collection(db, 'flights'),
      where('createdAt', '>=', start)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const flights = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
      }));
      setAllFlights(flights);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const getFlightClearanceStatus = (flight: any) => {
    if (flight.status === 'cancelled') return 'cancelled';
    if (flight.status === 'complete') return 'cleared';
    if (flight.status === 'landed') {
      if (flight.gliderOwnership === 'club' && !flight.pilotFlightTime && !flight.patternTowConfirmed) {
        return 'pending';
      }
      return 'cleared';
    }
    if (flight.manualClearanceAt) return 'cleared';
    return 'pending';
  };

  const clearedFlights = allFlights.filter(f => getFlightClearanceStatus(f) === 'cleared');
  const pendingFlights = allFlights.filter(f => getFlightClearanceStatus(f) === 'pending');
  const cancelledFlights = allFlights.filter(f => getFlightClearanceStatus(f) === 'cancelled');

  const canCloseDay = pendingFlights.length === 0 && allFlights.length > 0;

  const handleManualClear = async (flight: any, flightTimeOverride?: number) => {
    Alert.alert(
      'Confirm Pilot Safe',
      `Confirm ${flight.pilotName || flight.displayShorthand} has returned safely?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Safe',
          onPress: async () => {
            try {
              const updates: any = {
                manualClearanceAt: serverTimestamp(),
                manualClearedByUID: member?.uid,
                status: 'complete',
                updatedAt: serverTimestamp(),
              };
              // Club-glider rental time is billable — closing the flight out
              // without capturing it is exactly how a tow gets billed but the
              // rental doesn't. Only set when the caller resolved a value.
              if (flightTimeOverride !== undefined) {
                updates.pilotFlightTime = flightTimeOverride;
                updates.pilotFlightTimeAt = serverTimestamp();
                updates.flightTimeEnteredBy = 'line_chief_forced';
              }
              await updateDoc(doc(db, 'flights', flight.id), updates);
            } catch (error) {
              Alert.alert('Error', 'Could not clear flight.');
            }
          },
        },
      ]
    );
  };

  const handleForceClearWithTime = (flight: any) => {
    const raw = clearFlightTimes[flight.id] ?? '';
    const parsed = parseFloat(raw);
    if (!raw || isNaN(parsed) || parsed <= 0) {
      Alert.alert('Required', 'Please enter a valid flight time before clearing.');
      return;
    }
    handleManualClear(flight, parsed);
  };

  const handleCloseDay = async () => {
    if (!canCloseDay) return;
    setClosingDay(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      await addDoc(collection(db, 'dailySessions'), {
        sessionDate: today,
        dayClosedAt: serverTimestamp(),
        dayClosedByUID: member?.uid,
        dayClosedByName: member?.displayName,
        dayClosedMode: 'line_chief',
        totalFlights: allFlights.length,
        totalCleared: clearedFlights.length,
        totalCancelled: cancelledFlights.length,
        notes: closingNote || null,
      });

      Alert.alert(
        'Flying Day Closed',
        `${clearedFlights.length} flights cleared. ${cancelledFlights.length} cancelled. Have a safe evening!`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      Alert.alert('Error', 'Could not close flying day.');
    } finally {
      setClosingDay(false);
      setShowCloseConfirm(false);
    }
  };

  const getFlightLabel = (flight: any) => {
    return flight.displayShorthand || flight.pilotName || 'Unknown';
  };

  const getFlightType = (flight: any) => {
    if (flight.isDemoRide) return '🟢 Demo Ride';
    if (flight.flightCategory === 'aero_retrieve') return '🩷 Aero Retrieve';
    if (flight.gliderOwnership === 'private' || flight.gliderOwnership === 'private_other') return '🟡 Private';
    if (!flight.lineChiefPresent) return '🔵 Self-Logged';
    return '⬜ Club Glider';
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}>
    <ScrollView style={styles.container}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>End of Day</Text>
      <Text style={styles.subtitle}>{member?.displayName}</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#1A4E8C" style={{ marginTop: 40 }} />
      ) : allFlights.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No flights today</Text>
        </View>
      ) : (
        <>
          {/* Summary */}
          <View style={styles.summaryRow}>
            <View style={[styles.summaryBox, styles.summaryCleared]}>
              <Text style={styles.summaryNumber}>{clearedFlights.length}</Text>
              <Text style={styles.summaryLabel}>Cleared ✓</Text>
            </View>
            <View style={[styles.summaryBox, styles.summaryPending]}>
              <Text style={styles.summaryNumber}>{pendingFlights.length}</Text>
              <Text style={styles.summaryLabel}>Pending ⚠️</Text>
            </View>
            <View style={[styles.summaryBox, styles.summaryCancelled]}>
              <Text style={styles.summaryNumber}>{cancelledFlights.length}</Text>
              <Text style={styles.summaryLabel}>Cancelled ✗</Text>
            </View>
          </View>

          {/* Pending flights — need attention */}
          {pendingFlights.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>⚠️ Needs Attention</Text>
              {pendingFlights.map((flight) => {
                const missingFlightTime =
                  flight.status === 'landed' && flight.gliderOwnership === 'club' && !flight.pilotFlightTime;
                const inputValue =
                  clearFlightTimes[flight.id] !== undefined
                    ? clearFlightTimes[flight.id]
                    : (computeSystemFlightTime(flight)?.toFixed(1) ?? '');

                return (
                  <View key={flight.id} style={styles.pendingCard}>
                    <Text style={styles.flightLabel}>{getFlightLabel(flight)}</Text>
                    <Text style={styles.flightType}>{getFlightType(flight)}</Text>
                    <Text style={styles.flightStatus}>
                      Status: {flight.status}
                    </Text>
                    {flight.status === 'airborne' && (
                      <Text style={styles.flightWarning}>
                        ⚠️ Still airborne — confirm pilot has landed
                      </Text>
                    )}
                    {flight.needsReconciliation && (
                      <Text style={styles.reconciliationFlag}>
                        ⚠️ Landing time mismatch (~{Math.round(flight.reconciliationDeltaMin)} min) — pilot vs LC
                      </Text>
                    )}
                    {missingFlightTime ? (
                      <>
                        <Text style={styles.flightWarning}>
                          ⚠️ Missing flight time entry — billable rental time, don't clear without it
                        </Text>
                        <Text style={styles.clearTimeLabel}>Flight time (decimal hours)</Text>
                        <TextInput
                          style={styles.clearTimeInput}
                          placeholder="e.g. 0.5"
                          value={inputValue}
                          onChangeText={(val) =>
                            setClearFlightTimes((prev) => ({ ...prev, [flight.id]: val }))
                          }
                          keyboardType="decimal-pad"
                        />
                        <TouchableOpacity
                          style={styles.clearButton}
                          onPress={() => handleForceClearWithTime(flight)}>
                          <Text style={styles.clearButtonText}>
                            ✓ Clear With This Flight Time
                          </Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <TouchableOpacity
                        style={styles.clearButton}
                        onPress={() => handleManualClear(flight)}>
                        <Text style={styles.clearButtonText}>
                          ✓ Confirm Pilot Returned Safely
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </>
          )}

          {/* Cleared flights */}
          {clearedFlights.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>✅ Cleared</Text>
              {clearedFlights.map((flight) => (
                <View key={flight.id} style={styles.clearedCard}>
                  <View>
                    <Text style={styles.flightLabel}>{getFlightLabel(flight)}</Text>
                    <Text style={styles.flightType}>{getFlightType(flight)}</Text>
                    {flight.needsReconciliation && (
                      <Text style={styles.reconciliationFlag}>
                        ⚠️ Landing time mismatch (~{Math.round(flight.reconciliationDeltaMin)} min) — pilot vs LC
                      </Text>
                    )}
                  </View>
                  {flight.billedFlightTime && (
                    <Text style={styles.flightTime}>
                      {flight.billedFlightTime} hrs
                    </Text>
                  )}
                </View>
              ))}
            </>
          )}

          {/* Cancelled flights */}
          {cancelledFlights.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>✗ Cancelled</Text>
              {cancelledFlights.map((flight) => (
                <View key={flight.id} style={styles.cancelledCard}>
                  <Text style={styles.flightLabel}>{getFlightLabel(flight)}</Text>
                  <Text style={styles.flightType}>{getFlightType(flight)}</Text>
                </View>
              ))}
            </>
          )}

          {/* Close Day */}
          {canCloseDay && (
            <View style={styles.closeSection}>
              <Text style={styles.closeSectionTitle}>
                All pilots accounted for — ready to close
              </Text>
              <TextInput
                style={styles.notesInput}
                placeholder="Optional closing note..."
                value={closingNote}
                onChangeText={setClosingNote}
                multiline
              />
              <TouchableOpacity
                style={styles.closeButton}
                onPress={handleCloseDay}
                disabled={closingDay}>
                <Text style={styles.closeButtonText}>
                  {closingDay ? 'Closing...' : 'Close Flying Day'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {!canCloseDay && pendingFlights.length > 0 && (
            <View style={styles.cannotCloseBox}>
              <Text style={styles.cannotCloseText}>
                {pendingFlights.length} flight{pendingFlights.length > 1 ? 's' : ''} still pending — resolve before closing
              </Text>
            </View>
          )}
        </>
      )}

      <View style={{ height: 60 }} />
    </ScrollView>
    </KeyboardAvoidingView>
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
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
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
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  summaryBox: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
  },
  summaryCleared: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  summaryPending: {
    backgroundColor: '#FFF3E0',
    borderColor: '#FF9800',
  },
  summaryCancelled: {
    backgroundColor: '#F5F5F5',
    borderColor: '#bbb',
  },
  summaryNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A4E8C',
    marginBottom: 12,
    marginTop: 8,
  },
  pendingCard: {
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: '#FF9800',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  clearedCard: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#4CAF50',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cancelledCard: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  flightLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
  },
  flightType: {
    fontSize: 13,
    color: '#666',
    marginBottom: 2,
  },
  flightStatus: {
    fontSize: 13,
    color: '#888',
    marginBottom: 4,
    textTransform: 'capitalize',
  },
  flightWarning: {
    fontSize: 13,
    color: '#E65100',
    marginBottom: 8,
  },
  clearTimeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  clearTimeInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    marginBottom: 8,
  },
  flightTime: {
    fontSize: 14,
    color: '#2E7D32',
    fontWeight: '600',
  },
  reconciliationFlag: {
    fontSize: 12,
    color: '#E65100',
    fontWeight: '600',
    marginTop: 2,
  },
  clearButton: {
    backgroundColor: '#1A4E8C',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  clearButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  closeSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  closeSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginBottom: 12,
  },
  notesInput: {
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    marginBottom: 12,
    minHeight: 60,
  },
  closeButton: {
    backgroundColor: '#2E7D32',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cannotCloseBox: {
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    padding: 16,
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#FF9800',
    alignItems: 'center',
  },
  cannotCloseText: {
    fontSize: 14,
    color: '#E65100',
    textAlign: 'center',
  },
});