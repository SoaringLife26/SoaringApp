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
  limit,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useMember } from '../context/MemberContext';

export default function MyTicketScreen({ navigation }: any) {
  const { member } = useMember();
  const [activeFlights, setActiveFlights] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [flightTime, setFlightTime] = useState('');
  const [submittingTime, setSubmittingTime] = useState(false);

  useEffect(() => {
    if (!member?.uid) return;

    const q = query(
      collection(db, 'flights'),
      where('pilotId', '==', member.uid),
      where('status', 'in', ['pending', 'certified', 'airborne', 'landing_proposed', 'landed']),
      orderBy('createdAt', 'desc'),
      limit(5)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const flights = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
      }));
      setActiveFlights(flights);
      setLoading(false);
    });

    return unsubscribe;
  }, [member?.uid]);

  const handleLogLanding = async (flight: any) => {
    Alert.alert(
      'Log Landing',
      'Confirm you have landed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Landing',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'flights', flight.id), {
                status: 'landed',
                landingTime: serverTimestamp(),
                landingLoggedBy: 'pilot',
                updatedAt: serverTimestamp(),
              });
            } catch (error) {
              Alert.alert('Error', 'Could not log landing.');
            }
          },
        },
      ]
    );
  };

  const handleSubmitFlightTime = async (flight: any) => {
    if (!flightTime) {
      Alert.alert('Required', 'Please enter your flight time');
      return;
    }
    const parsed = parseFloat(flightTime);
    if (isNaN(parsed) || parsed <= 0) {
      Alert.alert('Invalid', 'Please enter a valid time (e.g. 0.5 or 1.3)');
      return;
    }
    setSubmittingTime(true);
    try {
      await updateDoc(doc(db, 'flights', flight.id), {
        pilotFlightTime: parsed,
        pilotFlightTimeAt: serverTimestamp(),
        status: 'complete',
        updatedAt: serverTimestamp(),
      });
      setFlightTime('');
      Alert.alert('Recorded', 'Flight time saved successfully.');
    } catch (error) {
      Alert.alert('Error', 'Could not save flight time.');
    } finally {
      setSubmittingTime(false);
    }
  };

  const handleCancelTicket = async (flight: any) => {
    Alert.alert(
      'Cancel Tow Request',
      'Are you sure you want to cancel this tow request?',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel Request',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'flights', flight.id), {
                status: 'cancelled',
                cancelledAt: serverTimestamp(),
                cancelledBy: member?.uid,
                updatedAt: serverTimestamp(),
              });
            } catch (error) {
              Alert.alert('Error', 'Could not cancel tow request.');
            }
          },
        },
      ]
    );
  };

  const getStatusDisplay = (status: string) => {
    const statusMap: Record<string, { label: string; color: string }> = {
      pending:          { label: '⏳ In Queue',        color: '#FF9800' },
      certified:        { label: '✅ Cleared for Tow', color: '#2E7D32' },
      airborne:         { label: '✈️ Airborne',         color: '#1A4E8C' },
      landing_proposed: { label: '🛬 Landing...',       color: '#9C27B0' },
      landed:           { label: '🛬 Landed',           color: '#2E7D32' },
      complete:         { label: '✅ Complete',          color: '#2E7D32' },
      cancelled:        { label: '❌ Cancelled',         color: '#999' },
    };
    return statusMap[status] || { label: status, color: '#333' };
  };

  const getCardColor = (flight: any) => {
    if (flight.flightCategory === 'aero_retrieve') return '#FCE4EC';
    if (!flight.lineChiefPresent) return '#E3F2FD';
    if (flight.gliderOwnership === 'private' ||
        flight.gliderOwnership === 'private_other') return '#FFF8E1';
    return '#FFFFFF';
  };

  return (
    <ScrollView style={styles.container}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>My Ticket</Text>
      <Text style={styles.pilotName}>{member?.displayName}</Text>
      <Text style={styles.memberNumber}>Member #{member?.memberNumber}</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#1A4E8C" style={{ marginTop: 40 }} />
      ) : activeFlights.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No active flights</Text>
          <Text style={styles.emptySubtext}>
            Submit a tow request to get started
          </Text>
          <TouchableOpacity
            style={styles.newTowButton}
            onPress={() => navigation.navigate('TowRequest')}>
            <Text style={styles.newTowText}>New Tow Request</Text>
          </TouchableOpacity>
        </View>
      ) : (
        activeFlights.map((flight) => {
          const status = getStatusDisplay(flight.status);
          const cardColor = getCardColor(flight);
          const isClubGlider = flight.gliderOwnership === 'club';
          const needsFlightTime = flight.status === 'landed' &&
            isClubGlider && !flight.pilotFlightTime;

          return (
            <View
              key={flight.id}
              style={[styles.flightCard, { backgroundColor: cardColor }]}>

              <View style={[styles.statusBadge, { backgroundColor: status.color }]}>
                <Text style={styles.statusText}>{status.label}</Text>
              </View>

              <Text style={styles.gliderName}>{flight.gliderDisplayName}</Text>
              <Text style={styles.flightDetail}>
                {flight.requestedAltitudeFt?.toLocaleString()} ft AGL
              </Text>
              <Text style={styles.flightDetail}>
                {flight.towType?.replace('_', ' ')}
              </Text>

              {flight.towPlaneNNumber && (
                <Text style={styles.towPlaneInfo}>
                  Tow plane: {flight.towPlaneDisplayName || flight.towPlaneNNumber}
                </Text>
              )}

              {flight.releaseAltitudeFt && (
                <Text style={styles.releaseAlt}>
                  Released at: {flight.releaseAltitudeFt.toLocaleString()} ft
                </Text>
              )}

              {flight.status === 'airborne' && (
                <TouchableOpacity
                  style={styles.landingButton}
                  onPress={() => handleLogLanding(flight)}>
                  <Text style={styles.landingButtonText}>🛬 Log My Landing</Text>
                </TouchableOpacity>
              )}

              {needsFlightTime && (
                <View style={styles.timeEntry}>
                  <Text style={styles.timeLabel}>
                    Enter your flight time (decimal hours e.g. 0.5)
                  </Text>
                  <TextInput
                    style={styles.timeInput}
                    placeholder="e.g. 0.5"
                    value={flightTime}
                    onChangeText={setFlightTime}
                    keyboardType="decimal-pad"
                  />
                  <TouchableOpacity
                    style={styles.timeSubmitButton}
                    onPress={() => handleSubmitFlightTime(flight)}
                    disabled={submittingTime}>
                    <Text style={styles.timeSubmitText}>
                      {submittingTime ? 'Saving...' : 'Submit Flight Time'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {flight.status === 'pending' && (
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => handleCancelTicket(flight)}>
                  <Text style={styles.cancelText}>Cancel Tow Request</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })
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
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  memberNumber: {
    fontSize: 14,
    color: '#888',
    marginBottom: 24,
  },
  emptyState: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginBottom: 24,
    textAlign: 'center',
  },
  newTowButton: {
    backgroundColor: '#1A4E8C',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  newTowText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  flightCard: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  gliderName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1A4E8C',
    marginBottom: 4,
  },
  flightDetail: {
    fontSize: 15,
    color: '#555',
    marginBottom: 2,
    textTransform: 'capitalize',
  },
  towPlaneInfo: {
    fontSize: 14,
    color: '#777',
    marginTop: 6,
  },
  releaseAlt: {
    fontSize: 14,
    color: '#2E7D32',
    fontWeight: '600',
    marginTop: 6,
  },
  landingButton: {
    backgroundColor: '#1A4E8C',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  landingButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  timeEntry: {
    marginTop: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FFA000',
  },
  timeLabel: {
    fontSize: 13,
    color: '#333',
    marginBottom: 8,
    fontWeight: '600',
  },
  timeInput: {
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
    marginBottom: 8,
  },
  timeSubmitButton: {
    backgroundColor: '#2E7D32',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  timeSubmitText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  cancelButton: {
    marginTop: 12,
    padding: 10,
    alignItems: 'center',
  },
  cancelText: {
    color: '#F44336',
    fontSize: 14,
  },
});
