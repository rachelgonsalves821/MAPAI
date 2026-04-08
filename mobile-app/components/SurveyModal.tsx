/**
 * Mapai — Arrival Survey Modal
 * PRD §loyalty: shown after QR check-in. Two questions, single-tap options,
 * completable in under 30 seconds. Skip is always available — no pressure.
 *
 * Bottom-sheet feel: slides up from the bottom, rounded top corners, drag
 * handle at the top.  Uses React Native's built-in Modal + Animated API so
 * there are no extra native dependencies.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ScrollView,
  ActivityIndicator,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { useSubmitSurvey, SurveyResponse } from '@/services/api/survey';

// ─── Types ────────────────────────────────────────────────────

interface SurveyQuestion {
  id: string;
  text: string;
  options: string[];
}

export interface SurveyData {
  id: string;
  placeName: string;
  pointsAwarded?: number;
  questions: SurveyQuestion[];
}

interface SurveyModalProps {
  visible: boolean;
  survey: SurveyData;
  onComplete: () => void;
  onSkip: () => void;
}

// ─── Progress Dots ────────────────────────────────────────────

function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <View style={dots.row} accessibilityLabel={`Question ${current + 1} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            dots.dot,
            i <= current ? dots.dotFilled : dots.dotEmpty,
            i === current && dots.dotCurrent,
          ]}
        />
      ))}
    </View>
  );
}

const dots = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: Spacing.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotEmpty: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
  },
  dotFilled: {
    backgroundColor: Colors.brandBlue,
  },
  dotCurrent: {
    width: 20,
    borderRadius: 4,
  },
});

// ─── Success State ────────────────────────────────────────────

function SuccessView({ points }: { points: number }) {
  const scaleAnim = useRef(new Animated.Value(0.6)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 120,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[success.container, { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}
    >
      <View style={success.iconRing}>
        <Ionicons name="checkmark" size={40} color="#FFFFFF" />
      </View>
      <Text style={success.title}>Thanks for your feedback!</Text>
      {points > 0 && (
        <View style={success.pointsBadge}>
          <Ionicons name="gift" size={16} color={Colors.brandBlue} />
          <Text style={success.pointsText}>+{points} points earned</Text>
        </View>
      )}
      <Text style={success.subtitle}>
        Your feedback helps us recommend better places for you.
      </Text>
    </Animated.View>
  );
}

const success = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: Spacing['2xl'],
    paddingHorizontal: Spacing.xl,
  },
  iconRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.glow(Colors.success),
  },
  title: {
    fontSize: Typography.sizes.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: Spacing.lg,
    textAlign: 'center',
  },
  pointsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.brandBlue + '15',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.brandBlue + '30',
  },
  pointsText: {
    fontSize: Typography.sizes.base,
    fontWeight: '700',
    color: Colors.brandBlue,
  },
  subtitle: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
    textAlign: 'center',
    lineHeight: 20,
  },
});

// ─── Option Chip ──────────────────────────────────────────────

interface OptionChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

function OptionChip({ label, selected, onPress }: OptionChipProps) {
  return (
    <TouchableOpacity
      style={[chip.base, selected && chip.selected]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <View style={chip.checkArea}>
        {selected ? (
          <View style={chip.checkFilled}>
            <Ionicons name="checkmark" size={12} color="#FFFFFF" />
          </View>
        ) : (
          <View style={chip.checkEmpty} />
        )}
      </View>
      <Text style={[chip.label, selected && chip.labelSelected]} numberOfLines={2}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const chip = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
    ...Shadows.sm,
  },
  selected: {
    borderColor: Colors.brandBlue,
    backgroundColor: Colors.brandBlue + '10',
  },
  checkArea: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkEmpty: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surfaceElevated,
  },
  checkFilled: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.brandBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
    fontSize: Typography.sizes.base,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  labelSelected: {
    color: Colors.textPrimary,
    fontWeight: '500',
  },
});

// ─── Main Modal ───────────────────────────────────────────────

const SCREEN_HEIGHT = Dimensions.get('window').height;
// Auto-dismiss the success state after this many ms
const SUCCESS_DISMISS_MS = 2200;

export default function SurveyModal({ visible, survey, onComplete, onSkip }: SurveyModalProps) {
  // Which question the user is on (0-indexed)
  const [questionIndex, setQuestionIndex] = useState(0);
  // Map from questionId → chosen answer text
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showSuccess, setShowSuccess] = useState(false);

  // Animated slide-in for each question
  const slideAnim = useRef(new Animated.Value(0)).current;

  const submitSurvey = useSubmitSurvey();

  // Reset state every time the modal opens with a fresh survey
  useEffect(() => {
    if (visible) {
      setQuestionIndex(0);
      setAnswers({});
      setShowSuccess(false);
      slideAnim.setValue(0);
    }
  }, [visible, survey?.id]);

  // Auto-dismiss after success animation completes
  useEffect(() => {
    if (!showSuccess) return;
    const timer = setTimeout(() => {
      onComplete();
    }, SUCCESS_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [showSuccess, onComplete]);

  const questions = survey?.questions ?? [];
  const currentQuestion = questions[questionIndex];
  const isLastQuestion = questionIndex === questions.length - 1;
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;
  const hasAnswer = !!currentAnswer;

  const animateToNext = useCallback(() => {
    // Quick fade out → swap content → fade in
    Animated.sequence([
      Animated.timing(slideAnim, {
        toValue: -24,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start(() => {
      slideAnim.setValue(24);
      setQuestionIndex((i) => i + 1);
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 160,
        friction: 9,
        useNativeDriver: true,
      }).start();
    });
  }, [slideAnim]);

  const handleSelectOption = useCallback(
    (option: string) => {
      if (!currentQuestion) return;
      setAnswers((prev) => ({ ...prev, [currentQuestion.id]: option }));
    },
    [currentQuestion],
  );

  const handleNext = useCallback(() => {
    if (!hasAnswer) return;
    if (!isLastQuestion) {
      animateToNext();
      return;
    }
    // Last question — submit
    const responses: SurveyResponse[] = questions
      .map((q) => ({ questionId: q.id, answer: answers[q.id] ?? '' }))
      .filter((r) => r.answer);

    submitSurvey.mutate(
      { surveyId: survey.id, responses },
      {
        onSuccess: () => setShowSuccess(true),
        onError: () => {
          // Still show success UX — the user did their part
          setShowSuccess(true);
        },
      },
    );
  }, [hasAnswer, isLastQuestion, animateToNext, questions, answers, survey, submitSurvey]);

  const points = survey?.pointsAwarded ?? 3;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onSkip}
      statusBarTranslucent
    >
      {/* Scrim */}
      <TouchableOpacity
        style={styles.scrim}
        activeOpacity={1}
        onPress={onSkip}
        accessibilityLabel="Dismiss survey"
      />

      {/* Sheet */}
      <View style={styles.sheet}>
        {/* Drag handle */}
        <View style={styles.handleBar}>
          <View style={styles.handle} />
        </View>

        {showSuccess ? (
          <SuccessView points={points} />
        ) : (
          <>
            {/* Check-in confirmation header */}
            <View style={styles.checkInHeader}>
              <View style={styles.checkInIconWrap}>
                <Ionicons name="location" size={20} color={Colors.brandBlue} />
              </View>
              <View style={styles.checkInTextWrap}>
                <Text style={styles.checkInPlace} numberOfLines={1}>
                  Checked in at {survey?.placeName ?? 'this place'}
                </Text>
                {points > 0 && (
                  <Text style={styles.checkInPoints}>+{points} points earned</Text>
                )}
              </View>
            </View>

            {/* Progress dots */}
            {questions.length > 1 && (
              <ProgressDots total={questions.length} current={questionIndex} />
            )}

            {/* Question + options */}
            <Animated.View
              style={[
                styles.questionWrap,
                {
                  opacity: slideAnim.interpolate({
                    inputRange: [-24, 0, 24],
                    outputRange: [0, 1, 0],
                    extrapolate: 'clamp',
                  }),
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              {currentQuestion && (
                <>
                  <Text style={styles.questionText}>{currentQuestion.text}</Text>
                  <ScrollView
                    style={styles.optionList}
                    contentContainerStyle={styles.optionListContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                  >
                    {currentQuestion.options.map((option) => (
                      <OptionChip
                        key={option}
                        label={option}
                        selected={currentAnswer === option}
                        onPress={() => handleSelectOption(option)}
                      />
                    ))}
                  </ScrollView>
                </>
              )}
            </Animated.View>

            {/* Footer actions */}
            <View style={styles.footer}>
              <TouchableOpacity
                onPress={onSkip}
                style={styles.skipButton}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Skip survey"
              >
                <Text style={styles.skipText}>Skip</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.nextButton, !hasAnswer && styles.nextButtonDisabled]}
                onPress={handleNext}
                disabled={!hasAnswer || submitSurvey.isPending}
                accessibilityRole="button"
                accessibilityLabel={isLastQuestion ? 'Submit survey' : 'Next question'}
              >
                {submitSurvey.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.nextButtonText}>
                      {isLastQuestion ? 'Submit' : 'Next'}
                    </Text>
                    <Ionicons
                      name={isLastQuestion ? 'checkmark' : 'arrow-forward'}
                      size={16}
                      color="#FFFFFF"
                    />
                  </>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },

  // Bottom sheet
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.9,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    ...Shadows.lg,
  },

  // Drag handle
  handleBar: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surfaceElevated,
  },

  // Check-in confirmation
  checkInHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    marginHorizontal: Spacing.base,
    backgroundColor: Colors.brandBlue + '0D',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.brandBlue + '25',
    marginBottom: Spacing.xs,
  },
  checkInIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.brandBlue + '18',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkInTextWrap: {
    flex: 1,
  },
  checkInPlace: {
    fontSize: Typography.sizes.base,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  checkInPoints: {
    fontSize: Typography.sizes.sm,
    color: Colors.brandBlue,
    fontWeight: '600',
    marginTop: 2,
  },

  // Question
  questionWrap: {
    paddingHorizontal: Spacing.base,
  },
  questionText: {
    fontSize: Typography.sizes.md,
    fontWeight: '600',
    color: Colors.textPrimary,
    lineHeight: 26,
    marginBottom: Spacing.base,
  },

  // Option list — max height so it scrolls on small devices
  optionList: {
    maxHeight: SCREEN_HEIGHT * 0.38,
  },
  optionListContent: {
    paddingBottom: Spacing.sm,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.base,
    marginTop: Spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.surfaceBorder,
  },
  skipButton: {
    paddingVertical: Spacing.md,
  },
  skipText: {
    fontSize: Typography.sizes.base,
    color: Colors.textTertiary,
    fontWeight: '500',
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.brandBlue,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
    minWidth: 108,
    justifyContent: 'center',
    ...Shadows.sm,
  },
  nextButtonDisabled: {
    backgroundColor: Colors.surfaceElevated,
    ...Shadows.sm,
  },
  nextButtonText: {
    fontSize: Typography.sizes.base,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
