import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
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
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useMember } from '../context/MemberContext';

export default function LineChiefScreen({ navigation }: any) {
  const { member } = useMember();
  const [pendingFlights, setPendingFlights] = useState<any[]>([]);
  const [airborneFlights, setAirborneFlights] = useState<any[]>([]);
  const [towPlanes, setTowPlanes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lineChiefMode, setLineChiefMode] = useState(true);
  const [activeTowPlaneId, setActiveTowPlaneId] = useState('');

  // Fetch tow planes
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
        setTowPlanes(planes);
      } catch (error) {
        console.error('Error fetching tow planes:', error);
      }
    };
    fetchTowPlanes();
  }, []);

  // Real-time listener for pending flights
  useEffect(() => {
    const q = query(
      collection(db, 'flights'),
      where('status', 'in', ['pending', 'certified']),
      orderBy('queuePosition', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const flights = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
      }));
      setPendingFlights(flights);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Real-time listener for airborne flights
  useEffect(() => {
    const q = query(
      collection(db, 'flights'),
      where('status', '==', 'airborne')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const flights = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
      }));
      setAirborneFlights(flights);
    });
    return unsubscribe;
  }, []);

  // Listen to global settings
  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'globalSettings', 'current'),
      (snapshot) => {
        if (snapshot.exists()) {
          setLineChiefMode(snapshot.data().lineChiefMode ?? true);
          setActiveTowPlaneId(snapshot.data().activeTowPlaneId || '');
        }
      }
    );
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

  const handleLogLanding = async (flight: any) => {
    Alert.alert(
      'Confirm Landing',
      `Log landing for ${flight.displayShorthand}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Landing',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'flights', flight.id), {
                status: 'landed',
                landingTime: serverTimestamp(),
                landingLoggedBy: 'line_chief',
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

  return (
    <ScrollView style={styles.container}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Line Chief</Text>
      <Text style={styles.subtitle}>{member?.displayName}</Text>

      {/* No line chief mode banner */}
      {!lineChiefMode && (
        <View style={styles.noLCBanner}>
          <Text style={styles.noLCBannerText}>
            ✈️ No Line Chief Mode Active
          </Text>
          <Text style={styles.noLCBannerSubtext}>
            Queue is read-only. Pilots are self-logging.
          </Text>
        </View>
      )}

      {/* Airborne List */}
      {airborneFlights.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>
            ✈️ Airborne ({airborneFlights.length})
          </Text>
          {airborneFlights.map((flight) => (
            <View key={flight.id} style={[styles.airborneCard, { backgroundColor: getCardColor(flight) }]}>
              <View style={styles.airborneHeader}>
                <Text style={styles.airborneGlider}>
                  {flight.displayShorthand}
                </Text>
                {flight.towPlaneNNumber && (
                  <Text style={styles.towPlaneTag}>
                    {flight.towPlaneNNumber}
                  </Text>
                )}
              </View>
              <Text style={styles.airborneType}>
                {getTowTypeBadge(flight.towType)}
              </Text>
              <TouchableOpacity
                style={styles.landingButton}
                onPress={() => handleLogLanding(flight)}>
                <Text style={styles.landingButtonText}>🛬 Log Landing</Text>
              </TouchableOpacity>
            </View>
          ))}
        </>
      )}

      {/* Pending Queue */}
      <Text style={styles.sectionTitle}>
        📋 Pending Queue ({pendingFlights.length})
      </Text>

      {loading ? (
        <ActivityIndicator size="large" color="#1A4E8C" style={{ marginTop: 40 }} />
      ) : pendingFlights.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No pending tow requests</Text>
        </View>
      ) : (
        pendingFlights.map((flight) => (
          <FlightCard
            key={flight.id}
            flight={flight}
            towPlanes={towPlanes}
            activeTowPlaneId={activeTowPlaneId}
            onCertify={handleCertify}
            onWheelsUp={handleWheelsUp}
            getTowTypeBadge={getTowTypeBadge}
          />
        ))
      )}

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

function getCardColor(flight: any) {
  if (flight.flightCategory === 'aero_retrieve') return '#FCE4EC';
  if (!flight.lineChiefPresent) return '#E3F2FD';
  if (flight.gliderOwnership === 'private' ||
      flight.gliderOwnership === 'private_other') return '#FFF8E1';
  if (flight.isDemoRide) return '#E8F5E9';
  return '#FFFFFF';

}


function FlightCard({ flight, towPlanes, activeTowPlaneId, onCertify, onWheelsUp, getTowTypeBadge }: any) {
  const [selectedTowPlane, setSelectedTowPlane] = useState('');

  // Auto-select from active tow pilot session or single plane
  useEffect(() => {
    if (activeTowPlaneId) {
      setSelectedTowPlane(activeTowPlaneId);
    } else if (towPlanes.length === 1) {
      setSelectedTowPlane(towPlanes[0].id);
    }
  }, [towPlanes, activeTowPlaneId]);

  return (
    <View style={[styles.flightCard, { backgroundColor: getCardColor(flight) }]}>
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
    </View>
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
  noLCBanner: {
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: '#FF9800',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
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
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A4E8C',
    marginBottom: 12,
    marginTop: 8,
  },
  airborneCard: {
    backgroundColor: '#E3F2FD',
    borderWidth: 1,
    borderColor: '#1A4E8C',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  airborneHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  airborneGlider: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A4E8C',
  },
  towPlaneTag: {
    fontSize: 13,
    color: '#555',
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  airborneType: {
    fontSize: 14,
    color: '#555',
    marginBottom: 12,
  },
  landingButton: {
    backgroundColor: '#1A4E8C',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  landingButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  flightCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
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

  badgeDemoRide: {
    backgroundColor: '#2E7D32',
  },

});