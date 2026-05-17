import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';

const TOW_TYPES = [
  { id: 'normal', label: 'Normal' },
  { id: 'pattern', label: 'Pattern' },
  { id: 'box_wake', label: 'Box the Wake' },
  { id: 'slack_line', label: 'Slack Line' },
  { id: 'tow_rope_fail', label: 'Tow Rope Fail' },
  { id: 'other', label: 'Other' },
];

const CLUB_GLIDERS = [
  { id: 'g1', label: 'N731SG — Schweizer 1-26' },
  { id: 'g2', label: 'N44SP — ASK-21' },
];

export default function TowRequestScreen() {
  const [selectedGlider, setSelectedGlider] = useState('');
  const [altitude, setAltitude] = useState('');
  const [selectedTowType, setSelectedTowType] = useState('');
  const [studentFlight, setStudentFlight] = useState(false);
  const [isDual, setIsDual] = useState(false);
  const [towTypeNote, setTowTypeNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedGlider) {
      Alert.alert('Required', 'Please select a glider');
      return;
    }
    if (!altitude) {
      Alert.alert('Required', 'Please enter a tow altitude');
      return;
    }
    if (!selectedTowType) {
      Alert.alert('Required', 'Please select a tow type');
      return;
    }

    setSubmitting(true);
    try {
      const pilot = auth.currentUser;
      await addDoc(collection(db, 'flights'), {
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        pilotId: pilot?.uid,
        pilotEmail: pilot?.email,
        gliderLabel: selectedGlider,
        requestedAltitudeFt: parseInt(altitude),
        towType: selectedTowType,
        towTypeNote: selectedTowType === 'other' ? towTypeNote : null,
        studentFlight,
        isDual,
        queuePosition: Date.now(),
      });
      Alert.alert('Submitted!', 'Your tow request is in the queue.');
      setSelectedGlider('');
      setAltitude('');
      setSelectedTowType('');
      setStudentFlight(false);
      setIsDual(false);
      setTowTypeNote('');
    } catch (error) {
      Alert.alert('Error', 'Could not submit tow request. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Tow Request</Text>

      {/* Glider Selection */}
      <Text style={styles.label}>Select Glider</Text>
      {CLUB_GLIDERS.map((glider) => (
        <TouchableOpacity
          key={glider.id}
          style={[
            styles.optionButton,
            selectedGlider === glider.label && styles.optionSelected,
          ]}
          onPress={() => setSelectedGlider(glider.label)}>
          <Text style={[
            styles.optionText,
            selectedGlider === glider.label && styles.optionTextSelected,
          ]}>
            {glider.label}
          </Text>
        </TouchableOpacity>
      ))}

      {/* Altitude */}
      <Text style={styles.label}>Tow Altitude (ft AGL)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 2500"
        value={altitude}
        onChangeText={setAltitude}
        keyboardType="numeric"
      />

      {/* Tow Type */}
      <Text style={styles.label}>Tow Type</Text>
      {TOW_TYPES.map((type) => (
        <TouchableOpacity
          key={type.id}
          style={[
            styles.optionButton,
            selectedTowType === type.id && styles.optionSelected,
          ]}
          onPress={() => setSelectedTowType(type.id)}>
          <Text style={[
            styles.optionText,
            selectedTowType === type.id && styles.optionTextSelected,
          ]}>
            {type.label}
          </Text>
        </TouchableOpacity>
      ))}

      {/* Other note */}
      {selectedTowType === 'other' && (
        <TextInput
          style={styles.input}
          placeholder="Describe the tow type"
          value={towTypeNote}
          onChangeText={setTowTypeNote}
        />
      )}

      {/* Student Flight Toggle */}
      <TouchableOpacity
        style={styles.toggleRow}
        onPress={() => setStudentFlight(!studentFlight)}>
        <Text style={styles.toggleLabel}>Student Flight</Text>
        <View style={[styles.toggle, studentFlight && styles.toggleOn]}>
          <Text style={styles.toggleText}>{studentFlight ? 'YES' : 'NO'}</Text>
        </View>
      </TouchableOpacity>

      {/* Dual Toggle */}
      <TouchableOpacity
        style={styles.toggleRow}
        onPress={() => setIsDual(!isDual)}>
        <Text style={styles.toggleLabel}>
          {studentFlight ? 'Dual (with Instructor)' : 'Dual (with Passenger)'}
        </Text>
        <View style={[styles.toggle, isDual && styles.toggleOn]}>
          <Text style={styles.toggleText}>{isDual ? 'YES' : 'NO'}</Text>
        </View>
      </TouchableOpacity>

      {/* Submit */}
      <TouchableOpacity
        style={styles.submitButton}
        onPress={handleSubmit}
        disabled={submitting}>
        <Text style={styles.submitText}>
          {submitting ? 'Submitting...' : 'Submit Tow Request'}
        </Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f4f8',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A4E8C',
    marginBottom: 24,
    marginTop: 60,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    marginBottom: 8,
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
    backgroundColor: '#1A4E8C',
    borderColor: '#1A4E8C',
  },
  optionText: {
    fontSize: 16,
    color: '#333',
  },
  optionTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 14,
    marginTop: 16,
  },
  toggleLabel: {
    fontSize: 16,
    color: '#333',
  },
  toggle: {
    backgroundColor: '#ddd',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  toggleOn: {
    backgroundColor: '#1A4E8C',
  },
  toggleText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  submitButton: {
    backgroundColor: '#1A4E8C',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 32,
  },
  submitText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});