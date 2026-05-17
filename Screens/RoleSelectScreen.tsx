import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../firebaseConfig';

const roles = [
  { id: 'glider_pilot', label: 'Glider Pilot', icon: '🛩️' },
  { id: 'tow_pilot', label: 'Tow Pilot', icon: '✈️' },
  { id: 'line_chief', label: 'Line Chief', icon: '📋' },
  { id: 'bookkeeper', label: 'Bookkeeper', icon: '📊' },
];

export default function RoleSelectScreen() {
  const handleRoleSelect = (roleId: string) => {
    // We will navigate to role screens here next
    console.log('Selected role:', roleId);
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>TSA Flight Line</Text>
      <Text style={styles.subtitle}>Select your role for today</Text>

      {roles.map((role) => (
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
    marginBottom: 8,
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