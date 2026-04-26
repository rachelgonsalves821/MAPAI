/**
 * Mapai — Review Modal
 * Shown after a check-in + survey to collect a star rating and optional text.
 * Submitting awards loyalty points (handled by the backend).
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  TextInput,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useSubmitReview } from '@/services/api/survey';

interface ReviewModalProps {
  visible: boolean;
  placeId: string;
  placeName: string;
  onComplete: (pointsAwarded: number) => void;
  onSkip: () => void;
}

export default function ReviewModal({
  visible,
  placeId,
  placeName,
  onComplete,
  onSkip,
}: ReviewModalProps) {
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const slideAnim = useRef(new Animated.Value(300)).current;
  const submitReview = useSubmitReview();

  useEffect(() => {
    if (visible) {
      setRating(0);
      setReviewText('');
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 10,
      }).start();
    } else {
      slideAnim.setValue(300);
    }
  }, [visible]);

  const handleSubmit = async () => {
    if (rating === 0) {
      Alert.alert('Rate your visit', 'Please select at least one star to continue.');
      return;
    }
    try {
      const result = await submitReview.mutateAsync({
        placeId,
        rating,
        reviewText: reviewText.trim() || undefined,
        placeName,
      });
      onComplete(result.points_awarded);
    } catch {
      Alert.alert('Could not save review', 'Please try again.');
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.backdrop} onPress={onSkip} activeOpacity={1} />
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
        >
          {/* Drag handle */}
          <View style={styles.handleBar}>
            <View style={styles.handle} />
          </View>

          <Text style={styles.title}>How was your visit?</Text>
          <Text style={styles.subtitle}>{placeName}</Text>

          {/* Star rating */}
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity
                key={star}
                onPress={() => setRating(star)}
                activeOpacity={0.7}
                style={styles.starButton}
              >
                <Ionicons
                  name={star <= rating ? 'star' : 'star-outline'}
                  size={36}
                  color={star <= rating ? '#F59E0B' : Colors.textTertiary}
                />
              </TouchableOpacity>
            ))}
          </View>

          {/* Optional text */}
          <TextInput
            style={styles.textInput}
            placeholder="What made it special? (optional)"
            placeholderTextColor={Colors.textTertiary}
            value={reviewText}
            onChangeText={setReviewText}
            maxLength={500}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{reviewText.length}/500</Text>

          {/* Points hint */}
          <View style={styles.pointsHint}>
            <Ionicons name="star-half" size={14} color={Colors.brandBlue} />
            <Text style={styles.pointsHintText}>Earn +5 points for your review</Text>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitButton, rating === 0 && styles.submitDisabled]}
              onPress={handleSubmit}
              disabled={submitReview.isPending}
            >
              {submitReview.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitText}>Submit Review</Text>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.base,
    paddingBottom: Platform.OS === 'ios' ? 34 : Spacing.base,
  },
  handleBar: {
    alignItems: 'center',
    paddingBottom: Spacing.md,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
  },
  title: {
    fontSize: Typography.sizes.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  stars: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  starButton: {
    padding: 4,
  },
  textInput: {
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: Typography.sizes.sm,
    color: Colors.textPrimary,
    backgroundColor: Colors.surface,
    minHeight: 80,
  },
  charCount: {
    fontSize: Typography.sizes.xs,
    color: Colors.textTertiary,
    textAlign: 'right',
    marginTop: 4,
    marginBottom: Spacing.md,
  },
  pointsHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: Spacing.lg,
    backgroundColor: Colors.surfaceElevated,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  pointsHintText: {
    fontSize: Typography.sizes.sm,
    color: Colors.brandBlue,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  skipButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: BorderRadius.md,
  },
  skipText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  submitButton: {
    flex: 2,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    backgroundColor: Colors.brandBlue,
    borderRadius: BorderRadius.md,
  },
  submitDisabled: {
    opacity: 0.5,
  },
  submitText: {
    fontSize: Typography.sizes.sm,
    color: '#fff',
    fontWeight: '700',
  },
});
