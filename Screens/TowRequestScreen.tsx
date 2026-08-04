import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { collection, addDoc, serverTimestamp, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useMember } from '../context/MemberContext';
import { useGlobalSettings } from '../context/GlobalSettingsContext';
import { getDaysSinceLastFlight, isCurrent, hasActiveClearance, fileClearanceRequest } from '../lib/currency';
import { Picker } from '@react-native-picker/picker';

const TOW_CATEGORIES = [
  { id: 'normal',        label: 'Normal' },
  { id: 'pattern',       label: 'Pattern' },
  { id: 'tow_rope_fail', label: 'Tow Rope Fail' },
  { id: 'aero_retrieve', label: 'Aero Retrieve' },
];

const TRAINING_MANEUVERS = [
  { id: 'box_wake',   label: 'Box the Wake' },
  { id: 'slack_line', label: 'Slack Line' },
];


export default function TowRequestScreen({ navigation }: any) {
  const { member } = useMember();
  const { lineChiefMode } = useGlobalSettings();
  const [clubGliders, setClubGliders] = useState<any[]>([]);
  const [glidersLoading, setGlidersLoading] = useState(true);
  const [gliderPath, setGliderPath] = useState<'club' | 'private' | 'other'>('club');
  const [selectedGlider, setSelectedGlider] = useState<any>(null);
  const [otherGliderDesc, setOtherGliderDesc] = useState('');
  const [altitude, setAltitude] = useState('');
  const [selectedTowType, setSelectedTowType] = useState('normal');
  const [trainingManeuvers, setTrainingManeuvers] = useState<string[]>([]);
  const [towTypeNote, setTowTypeNote] = useState('');
  const [studentFlight, setStudentFlight] = useState(false);
  const [isDual, setIsDual] = useState(false);
  const [passengerName, setPassengerName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchGliders = async () => {
      try {
        const q = query(
          collection(db, 'gliders'),
          where('isActive', '==', true),
          where('isClubGlider', '==', true)
        );
        const snapshot = await getDocs(q);
        const gliderList = snapshot.docs.map(doc => ({
          id: doc.id,
          label: doc.data().displayName,
          nNumber: doc.data().nNumber,
          isTwoSeat: doc.data().isTwoSeat,
          sortOrder: doc.data().sortOrder || 0,
        }));
        gliderList.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        setClubGliders(gliderList);
      } catch (error) {
        console.error('Error fetching gliders:', error);
      } finally {
        setGlidersLoading(false);
      }
    };

   fetchGliders();
  }, []);

  const selectedGliderIsTwoSeat =
    gliderPath === 'club' && selectedGlider?.isTwoSeat;

  const handleSubmit = async () => {
    if (gliderPath === 'club' && !selectedGlider) {
      Alert.alert('Required', 'Please select a glider');
      return;
    }
    if (gliderPath === 'other' && !otherGliderDesc) {
      Alert.alert('Required', 'Please describe the glider');
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
    if (selectedTowType === 'aero_retrieve') {
      Alert.alert('Aero Retrieve', 'Aero retrieve tickets are created by the tow pilot. Please contact the tow pilot.');
      return;
    }
    if (isDual && !studentFlight && !passengerName) {
      Alert.alert('Required', 'Please enter passenger name');
      return;
    }

    // Glider currency check — club glider paths only (Path 1 / Path 3).
    // Private-glider and borrowed-glider flights are not gated. See spec
    // Section 15.
    let flownWhileNotCurrent = false;
    let daysSinceLastFlightAtSubmission: number | null = null;
    if (gliderPath === 'club' && member?.uid) {
      const daysSinceLastFlight = await getDaysSinceLastFlight(member.uid);
      if (!isCurrent(daysSinceLastFlight)) {
        if (lineChiefMode) {
          const cleared = await hasActiveClearance(member.uid);
          if (!cleared) {
            await fileClearanceRequest(member.uid, member.displayName, daysSinceLastFlight);
            Alert.alert(
              'Currency Required',
              daysSinceLastFlight === null
                ? 'You have no flight on record in the last 90 days. You must be cleared by the Line Chief before submitting a tow request today.'
                : `You have not flown a glider in ${daysSinceLastFlight} days. You must be cleared by the Line Chief before submitting a tow request today.`
            );
            return;
          }
        } else {
          // No Line Chief present to grant clearance — don't strand the
          // pilot. Let the request through and tag it for admin follow-up.
          flownWhileNotCurrent = true;
          daysSinceLastFlightAtSubmission = daysSinceLastFlight;
        }
      }
    }

    setSubmitting(true);
    try {
      // Determine glider details
      let gliderOwnership = 'club';
      let gliderDisplayName = selectedGlider?.label || '';
      let gliderNNumber = selectedGlider?.nNumber || '';

      if (gliderPath === 'private') {
        gliderOwnership = 'private';
        gliderDisplayName = member?.privateGlider?.displayName || '';
        gliderNNumber = member?.privateGlider?.nNumber || '';
      } else if (gliderPath === 'other') {
        gliderOwnership = 'private_other';
        gliderDisplayName = otherGliderDesc;
        gliderNNumber = '';
      }

      // Build display shorthand
      const lastName = member?.displayName?.split(' ').pop() || '';
      const displayShorthand = gliderDisplayName + ' / ' + lastName;

      await addDoc(collection(db, 'flights'), {
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        queuePosition: Date.now(),

        // Pilot info from member context
        pilotId: member?.uid || '',
        pilotName: member?.displayName || '',
        pilotLastName: lastName,
        memberNumber: member?.memberNumber || '',

        // Glider info
        gliderOwnership,
        gliderDisplayName,
        gliderNNumber,
        displayShorthand,

        // Tow details
        requestedAltitudeFt: parseInt(altitude),
        towType: selectedTowType,
        towTypeNote: towTypeNote || null,
        trainingManeuvers: selectedTowType === 'normal' ? trainingManeuvers : [],

        // Flight type
        studentFlight,
        isDual,
        hasPassenger: isDual && !studentFlight,
        passenger: isDual && !studentFlight
          ? { name: passengerName }
          : null,

        // Flags
        patternTowConfirmed: false,
        reconciled: false,
        needsReconciliation: false,
        missingFlightTime: false,
        postponeCount: 0,
        lineChiefPresent: lineChiefMode,

        // Currency (Section 15) — no-line-chief exception tagging only;
        // in line-chief mode a lapsed pilot is blocked before reaching
        // this point.
        flownWhileNotCurrent,
        daysSinceLastFlightAtSubmission,
      });

      Alert.alert(
        'Submitted!',
        'Your tow request is in the queue.',
        [{ text: 'OK', onPress: () => navigation.navigate('MyTicket') }]
      );
      setSelectedGlider(null);
      setAltitude('');
      setSelectedTowType('normal');
      setTrainingManeuvers([]);
      setTowTypeNote('');
      setStudentFlight(false);
      setIsDual(false);
      setPassengerName('');
      setOtherGliderDesc('');
    } catch (error) {
      Alert.alert('Error', 'Could not submit tow request. Try again.');
    } finally {
      setSubmitting(false);
    }
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

      <Text style={styles.title}>Tow Request</Text>
      <Text style={styles.pilotName}>{member?.displayName}</Text>
      <Text style={styles.memberNumber}>Member #{member?.memberNumber}</Text>

      {/* Glider Path Selection */}
      <Text style={styles.label}>Glider</Text>

      {member?.privateGlider && (
        <>
          <TouchableOpacity
            style={[styles.optionButton, gliderPath === 'private' && styles.optionSelected]}
            onPress={() => { setGliderPath('private'); setSelectedGlider(null); }}>
            <Text style={[styles.optionText, gliderPath === 'private' && styles.optionTextSelected]}>
              My Glider — {member.privateGlider.displayName}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.optionButton, gliderPath === 'club' && styles.optionSelected]}
            onPress={() => { setGliderPath('club'); setSelectedGlider(null); }}>
            <Text style={[styles.optionText, gliderPath === 'club' && styles.optionTextSelected]}>
              Fly a club glider instead
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.optionButton, gliderPath === 'other' && styles.optionSelected]}
            onPress={() => { setGliderPath('other'); setSelectedGlider(null); }}>
            <Text style={[styles.optionText, gliderPath === 'other' && styles.optionTextSelected]}>
              Flying another member's glider
            </Text>
          </TouchableOpacity>
        </>
      )}

      {/* Club Glider Picker */}
      {gliderPath === 'club' && (
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={selectedGlider?.id || ''}
            onValueChange={(itemValue) => {
              const glider = clubGliders.find(g => g.id === itemValue);
              setSelectedGlider(glider || null);
            }}
            style={styles.picker}>
            <Picker.Item label={glidersLoading ? "Loading..." : "— Select a glider —"} value="" />
            {clubGliders.map((glider) => (
              <Picker.Item
                key={glider.id}
                label={glider.label}
                value={glider.id}
              />
            ))}
          </Picker>
        </View>
      )}

      {/* Other glider free text */}
      {gliderPath === 'other' && (
        <TextInput
          style={styles.input}
          placeholder="Contest number or description (e.g. 42 or blue Discus)"
          value={otherGliderDesc}
          onChangeText={setOtherGliderDesc}
        />
      )}

      {/* Altitude */}
      <Text style={[
        styles.label,
        (selectedTowType === 'pattern' || selectedTowType === 'aero_retrieve') && styles.labelDisabled,
      ]}>
        Tow Altitude (ft AGL)
      </Text>
      <TextInput
        style={[
          styles.input,
          (selectedTowType === 'pattern' || selectedTowType === 'aero_retrieve') && styles.inputDisabled,
        ]}
        placeholder={
          selectedTowType === 'pattern' ? 'N/A — Pattern Tow' :
          selectedTowType === 'aero_retrieve' ? 'N/A — Aero Retrieve' :
          'e.g. 2500'
        }
        value={(selectedTowType === 'pattern' || selectedTowType === 'aero_retrieve') ? '' : altitude}
        onChangeText={setAltitude}
        keyboardType="numeric"
        editable={selectedTowType !== 'pattern' && selectedTowType !== 'aero_retrieve'}
      />

      {/* Tow Category */}
      <Text style={styles.label}>Tow Type</Text>
      <View style={styles.towTypeGrid}>
        {TOW_CATEGORIES.map((type) => (
          <TouchableOpacity
            key={type.id}
            style={[
              styles.towTypeButton,
              selectedTowType === type.id && styles.towTypeSelected,
            ]}
            onPress={() => {
              setSelectedTowType(type.id);
              setTrainingManeuvers([]);
              if (type.id === 'pattern' || type.id === 'aero_retrieve') {
                setAltitude('');
              }
            }}>
            <Text style={[
              styles.towTypeText,
              selectedTowType === type.id && styles.towTypeTextSelected,
            ]}>
              {type.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Training Maneuvers — Normal only */}
      {selectedTowType === 'normal' && (
        <>
          <Text style={styles.labelOptional}>Training Maneuvers (optional)</Text>
          <View style={styles.towTypeGrid}>
            {TRAINING_MANEUVERS.map((maneuver) => (
              <TouchableOpacity
                key={maneuver.id}
                style={[
                  styles.towTypeButton,
                  trainingManeuvers.includes(maneuver.id) && styles.towTypeSelected,
                ]}
                onPress={() => {
                  setTrainingManeuvers(prev =>
                    prev.includes(maneuver.id)
                      ? prev.filter(m => m !== maneuver.id)
                      : [...prev, maneuver.id]
                  );
                }}>
                <Text style={[
                  styles.towTypeText,
                  trainingManeuvers.includes(maneuver.id) && styles.towTypeTextSelected,
                ]}>
                  {maneuver.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

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
        onPress={() => {
          setStudentFlight(!studentFlight);
          setIsDual(false);
          setPassengerName('');
        }}>
        <Text style={styles.toggleLabel}>Student Flight</Text>
        <View style={[styles.toggle, studentFlight && styles.toggleOn]}>
          <Text style={styles.toggleText}>{studentFlight ? 'YES' : 'NO'}</Text>
        </View>
      </TouchableOpacity>

      {/* Dual Toggle — only show for two-seat gliders or student flights */}
      {(studentFlight || selectedGliderIsTwoSeat) && (
        <TouchableOpacity
          style={styles.toggleRow}
          onPress={() => {
            setIsDual(!isDual);
            setPassengerName('');
          }}>
          <Text style={styles.toggleLabel}>
            {studentFlight ? 'Dual (with Instructor)' : 'Dual (with Passenger)'}
          </Text>
          <View style={[styles.toggle, isDual && styles.toggleOn]}>
            <Text style={styles.toggleText}>{isDual ? 'YES' : 'NO'}</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Passenger name — non-student dual only */}
      {isDual && !studentFlight && (
        <>
          <Text style={styles.label}>Passenger Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Full name"
            value={passengerName}
            onChangeText={setPassengerName}
          />
        </>
      )}

      {/* Submit */}
      <TouchableOpacity
        style={styles.submitButton}
        onPress={handleSubmit}
        disabled={submitting}>
        <Text style={styles.submitText}>
          {submitting ? 'Submitting...' : 'Submit Tow Request'}
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
  pickerContainer: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginBottom: 8,
    overflow: 'hidden',
  },
  picker: {
    height: 50,
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
    flex: 1,
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
  towTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  towTypeButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 4,
  },
  towTypeSelected: {
    backgroundColor: '#1A4E8C',
    borderColor: '#1A4E8C',
  },
  towTypeText: {
    fontSize: 14,
    color: '#333',
  },
  towTypeTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  labelDisabled: {
    color: '#bbb',
  },

  labelOptional: {
    fontSize: 14,
    fontWeight: '500',
    color: '#888',
    marginBottom: 8,
    marginTop: 12,
    fontStyle: 'italic',
  },

  inputDisabled: {
    backgroundColor: '#f0f0f0',
    borderColor: '#ddd',
    color: '#bbb',
  },
});