import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Modal, Animated, Dimensions } from 'react-native';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';

interface SurveyModalProps {
  isVisible: boolean;
  onClose: () => void;
  placeName: string;
  onSubmit: (rating: number, tags: string[]) => void;
}

export default function SurveyModal({ isVisible, onClose, placeName, onSubmit }: SurveyModalProps) {
  const [rating, setRating] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const REACTION_TAGS = ['Vibe was off', 'Too loud', 'Great WiFi', 'Hidden Gem', 'Pricey', 'Fast Service'];

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handlePressSubmit = () => {
    onSubmit(rating, selectedTags);
    onClose();
  };

  return (
    <Modal
      transparent
      visible={isVisible}
      animationType="fade"
    >
      <View style={styles.overlay}>
        <View style={styles.content}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.textTertiary} />
          </TouchableOpacity>

          <Text style={styles.title}>How was {placeName}?</Text>
          <Text style={styles.subtitle}>Your feedback helps Mapai learn your vibe.</Text>

          {/* Star Rating */}
          <View style={styles.ratingRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity key={star} onPress={() => setRating(star)}>
                <Ionicons 
                  name={star <= rating ? "star" : "star-outline"} 
                  size={32} 
                  color={star <= rating ? Colors.brandViolet : Colors.textTertiary} 
                />
              </TouchableOpacity>
            ))}
          </View>

          {/* Quick Tags */}
          <View style={styles.tagsGrid}>
            {REACTION_TAGS.map((tag) => (
              <TouchableOpacity 
                key={tag} 
                style={[
                  styles.tag,
                  selectedTags.includes(tag) && styles.tagSelected
                ]}
                onPress={() => toggleTag(tag)}
              >
                <Text style={[
                  styles.tagText,
                  selectedTags.includes(tag) && styles.tagTextSelected
                ]}>{tag}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity 
            style={[styles.submitButton, rating === 0 && styles.submitButtonDisabled]}
            disabled={rating === 0}
            onPress={handlePressSubmit}
          >
            <Text style={styles.submitText}>Save Vibe</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: 30,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    ...Shadows.lg,
  },
  closeButton: {
    position: 'absolute',
    top: 20,
    right: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  ratingRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  tagsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 32,
  },
  tag: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  tagSelected: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    borderColor: Colors.brandViolet,
  },
  tagText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  tagTextSelected: {
    color: Colors.brandViolet,
  },
  submitButton: {
    width: '100%',
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.brandViolet,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.md,
  },
  submitButtonDisabled: {
    backgroundColor: Colors.surfaceElevated,
    opacity: 0.5,
  },
  submitText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
