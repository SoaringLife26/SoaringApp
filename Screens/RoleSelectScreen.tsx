import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { useMember } from '../context/MemberContext';

type Role = {
  id: string;
  label: string;
  icon: string;
};

const ALL_ROLES: Role[] = [
  { id: 'glider_pilot', label: 'Glider Pilot',  icon: '🛩️' },
  { id: 'tow_pilot',    label: 'Tow Pilot',     icon: '✈️' },
  { id: 'line_chief',   label: 'Line Chief',    icon: '📋' },
  { id: 'demo_ride',    label: 'Demo Ride',     icon: '🎟️' },
];

export default function RoleSelectScreen({ navigation }: any) {
  const { member, loading } = useMember();

  const handleRoleSelect = (roleId: string) => {
    if (roleId === 'glider_pilot') {
      navigation.navigate('TowRequest');
    }
    if (roleId === 'tow_pilot') {
      navigation.navigate('TowPilot');
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1A4E8C" />
      </View>
    );
  }

  const availableRoles: Role[] = [ALL_ROLES[0]];

  if (member?.isTowPilotQualified && member?.isTowPilotCurrent) {
    availableRoles.push(ALL_ROLES[1]);
  }

  availableRoles.push(ALL_ROLES[2]);

  if (member?.isRideGiverAuthorized) {
    availableRoles.push(ALL_ROLES[3]);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>TSA Flight Line</Text>
      {member?.displayName ? (
        <Text style={styles.welcome}>Welcome, {member.displayName}</Text>
      ) : null}
      <Text style={styles.subtitle}>Select your role for today</Text>

      {availableRoles.map((role) => (
        <TouchableOpacity
          key={role.id}
          style={styles.roleButton}
          onPress={() => handleRoleSelect(role.id)}>
          <Text style={styles.roleIcon}>{role.icon}</Text>
          <Text style={styles.roleLabel}>{role.label}</Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#f0f4f8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: '#f0f4f8',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1A4E8C',
    marginBottom: 4,
  },
  welcome: {
    fontSize: 16,
    color: '#1A4E8C',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 40,
  },
  roleButton: {
    width: '100%',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#1A4E8C',
    borderRadius: 12,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  roleIcon: {
    fontSize: 28,
    marginRight: 16,
  },
  roleLabel: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1A4E8C',
  },
  signOutButton: {
    marginTop: 24,
    padding: 12,
  },
  signOutText: {
    color: '#999',
    fontSize: 14,
  },
});