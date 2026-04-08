import React from 'react';
import { TouchableOpacity, Text, View, ViewStyle } from 'react-native';

interface PillButtonProps {
  label: string;
  onPress: () => void;
  variant: 'white' | 'navy' | 'disabled';
  icon?: React.ReactNode;
  style?: ViewStyle;
}

export function PillButton({ label, onPress, variant, icon, style }: PillButtonProps) {
  const bgColor = { white: '#FFFFFF', navy: '#0558E8', disabled: '#E8E5F0' }[variant];
  const textColor = { white: '#0F1419', navy: '#FFFFFF', disabled: '#A8A3B8' }[variant];

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={variant === 'disabled'}
      activeOpacity={0.85}
      style={[{
        height: 56,
        borderRadius: 999,
        backgroundColor: bgColor,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: '100%',
      }, style]}
    >
      <Text style={{ fontSize: 16, fontWeight: '600', color: textColor }}>{label}</Text>
      {icon && <View>{icon}</View>}
    </TouchableOpacity>
  );
}
