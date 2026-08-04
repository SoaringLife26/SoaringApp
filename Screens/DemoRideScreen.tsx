import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { collection, addDoc, serverTimestamp, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useMember } from '../context/MemberContext';

export default function DemoRideScreen({ navigation }: any) {
  const { member } = useMember();

  // Gliders
  const [twoSeatGliders, setTwoSeatGliders] = useState<any[]>([]);
  const [selectedGlider, setSelectedGlider] = useState<any>(null);

  // Passenger info
  const [passengerFirstName, setPassengerFirstName] = useState('');
  const [passengerLastName, setPassengerLastName] = useState('');
  const [passengerContact, setPassengerContact] = useState('');

  // Waiver — hard gate
  const [waiverConfirmed, setWaiverConfirmed] = useState(false);

  // Tow details
  const [altitude, setAltitude] = useState('');
  const [paymentNote, setPaymentNote] = useState('');

  const [submitting, setSubmitting] = useState(false);

  // Fetch two-seat club gliders only
  useEffect(() => {
    const fetchGliders = async () => {
      try {
        const q = query(
          collection(db, 'gliders'),
          where('isActive', '==', true),
          where('isClubGlider', '==', true),
          where('isTwoSeat', '==', true)
        );
        const snapshot = await getDocs(q);
        const gliders = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data(),
        }));
        gliders.sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0));
        setTwoSeatGliders(gliders);
      } catch (error) {
        console.error('Error fetching gliders:', error);
      }
    };
    fetchGliders();
  }, []);

  const handleSubmit = async () => {
    if (!selectedGlider) {
      Alert.alert('Required', 'Please select a glider');
      return;
    }
    if (!passengerFirstName || !passengerLastName) {
      Alert.alert('Required', 'Please enter passenger name');
      return;
    }
    if (!passengerContact) {
      Alert.alert('Required', 'Please enter passenger contact information');
      return;
    }
    if (!waiverConfirmed) {
      Alert.alert(
        'Waiver Required',
        'You must confirm the passenger waiver has been signed before submitting.'
      );
      return;
    }
    if (!altitude) {
      Alert.alert('Required', 'Please enter tow altitude');
      return;
    }

    setSubmitting(true);
    try {
      const lastName = member?.displayName?.split(' ').pop() || '';
      const displayShorthand = selectedGlider.displayName + ' / ' + lastName;

      await addDoc(collection(db, 'flights'), {
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        queuePosition: Date.now(),

        // Ride giver info
        pilotId: member?.uid || '',
        pilotName: member?.displayName || '',
        pilotLastName: lastName,
        memberNumber: member?.memberNumber || '',
        rideGiverId: member?.uid || '',
        rideGiverName: member?.displayName || '',
        rideGiverMemberNumber: member?.memberNumber || '',

        // Flight classification
        isDemoRide: true,
        flightCategory: 'standard',
        gliderOwnership: 'club',
        gliderDisplayName: selectedGlider.displayName,
        gliderNNumber: selectedGlider.nNumber,
        gliderId: selectedGlider.id,
        displayShorthand,

        // Demo ride details
        demoRide: {
          passengerFirstName,
          passengerLastName,
          passengerContact,
          waiverConfirmed: true,
          waiverConfirmedAt: serverTimestamp(),
          paymentNote: paymentNote || null,
        },

        // Tow details
        requestedAltitudeFt: parseInt(altitude),
        towType: 'normal',
        trainingManeuvers: [],

        // Flags
        studentFlight: false,
        isDual: true,
        hasPassenger: false,
        lineChiefPresent: true,
        patternTowConfirmed: false,
        reconciled: false,
        needsReconciliation: false,
        missingFlightTime: false,
        postponeCount: 0,
      });

      Alert.alert(
        'Demo Ride Submitted!',
        'Your demo ride request is in the queue.',
        [{ text: 'OK', onPress: () => navigation.navigate('RoleSelect') }]
      );
    } catch (error) {
      Alert.alert('Error', 'Could not submit demo ride. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const passengerFullName = `${passengerFirstName} ${passengerLastName}`.trim();

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

      <Text style={styles.title}>Demo Ride</Text>
      <Text style={styles.rideGiverName}>{member?.displayName}</Text>
      <Text style={styles.memberNumber}>Member #{member?.memberNumber}</Text>

      {/* Glider Selection */}
      <Text style={styles.label}>Select Glider (Two-Seat)</Text>
      {twoSeatGliders.map((glider) => (
        <TouchableOpacity
          key={glider.id}
          style={[
            styles.optionButton,
            selectedGlider?.id === glider.id && styles.optionSelected,
          ]}
          onPress={() => setSelectedGlider(glider)}>
          <Text style={[
            styles.optionText,
            selectedGlider?.id === glider.id && styles.optionTextSelected,
          ]}>
            {glider.displayName}
          </Text>
        </TouchableOpacity>
      ))}

      {/* Passenger Info */}
      <Text style={styles.label}>Passenger First Name</Text>
      <TextInput
        style={styles.input}
        placeholder="First name"
        value={passengerFirstName}
        onChangeText={setPassengerFirstName}
      />

      <Text style={styles.label}>Passenger Last Name</Text>
      <TextInput
        style={styles.input}
        placeholder="Last name"
        value={passengerLastName}
        onChangeText={setPassengerLastName}
      />

      <Text style={styles.label}>Passenger Contact (phone or email)</Text>
      <TextInput
        style={styles.input}
        placeholder="Phone or email"
        value={passengerContact}
        onChangeText={setPassengerContact}
        autoCapitalize="none"
      />

      {/* Waiver Gate */}
      <View style={[
        styles.waiverBox,
        waiverConfirmed ? styles.waiverConfirmed : styles.waiverPending,
      ]}>
        <View style={styles.waiverRow}>
          <Text style={styles.waiverText}>
            {passengerFullName
              ? `I confirm ${passengerFullName}'s club liability waiver has been signed and collected.`
              : 'I confirm the passenger\'s club liability waiver has been signed and collected.'}
          </Text>
          <Switch
            value={waiverConfirmed}
            onValueChange={setWaiverConfirmed}
            trackColor={{ false: '#ddd', true: '#4CAF50' }}
            thumbColor={waiverConfirmed ? '#fff' : '#f4f3f4'}
          />
        </View>
        {!waiverConfirmed && (
          <Text style={styles.waiverWarning}>
            ⚠️ Waiver must be confirmed before submitting
          </Text>
        )}
      </View>

      {/* Altitude */}
      <Text style={styles.label}>Tow Altitude (ft AGL)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 2500"
        value={altitude}
        onChangeText={setAltitude}
        keyboardType="numeric"
      />

      {/* Payment Note */}
      <Text style={styles.labelOptional}>Payment Note (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="Amount and method for bookkeeper"
        value={paymentNote}
        onChangeText={setPaymentNote}
      />

      {/* Submit */}
      <TouchableOpacity
        style={[
          styles.submitButton,
          (!waiverConfirmed || submitting) && styles.submitButtonDisabled,
        ]}
        onPress={handleSubmit}
        disabled={!waiverConfirmed || submitting}>
        <Text style={styles.submitText}>
          {submitting ? 'Submitting...' : 'Submit Demo Ride Request'}
        </Text>
      </TouchableOpacity>

      <View style={{ height: 60 }} />
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E8F5E9',
    padding: 24,
  },
  backButton: {
    marginTop: 60,
    marginBottom: 8,
  },
  backText: {
    fontSize: 16,
    color: '#2E7D32',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginBottom: 4,
  },
  rideGiverName: {
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
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 16,
  },
  labelOptional: {
    fontSize: 14,
    fontWeight: '500',
    color: '#888',
    marginBottom: 8,
    marginTop: 12,
    fontStyle: 'italic',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    marginBottom: 4,
  },
  optionButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
  },
  optionSelected: {
    backgroundColor: '#880E4F',
    borderColor: '#2E7D32',
  },
  optionText: {
    fontSize: 16,
    color: '#333',
  },
  optionTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  waiverBox: {
    borderRadius: 8,
    padding: 14,
    marginTop: 16,
    marginBottom: 8,
    borderWidth: 1,
  },
  waiverPending: {
    backgroundColor: '#FFF3E0',
    borderColor: '#FF9800',
  },
  waiverConfirmed: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  waiverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  waiverText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  waiverWarning: {
    fontSize: 12,
    color: '#E65100',
    marginTop: 8,
  },
  submitButton: {
    backgroundColor: '#2E7D32',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 32,
  },
  submitButtonDisabled: {
    backgroundColor: '#bbb',
  },
  submitText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});