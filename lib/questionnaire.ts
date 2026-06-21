import { Answers } from '@/lib/survey';

export type Kind = 'single' | 'multi' | 'rating' | 'text';

export type SurveyQuestion = {
  id: string;
  section: number;
  title: string;
  helper?: string;
  kind: Kind;
  options?: string[];
  required?: boolean;
  max?: number;
  placeholder?: string;
  multiline?: boolean;
  otherKey?: string;
  otherPlaceholder?: string;
  condition?: (answers: Answers) => boolean;
  validate?: (value: unknown) => string | null;
};

export const QUESTION_CONFIG_STORAGE_KEY = 'kitchen-study-question-config-v1';

export const baseQuestions: SurveyQuestion[] = [
  {
    id: 'name',
    section: 0,
    title: 'What is your name?',
    helper: 'Used only for research analysis. Not shared publicly.',
    kind: 'text',
    required: true,
    placeholder: 'Your full name',
  },
  {
    id: 'gender',
    section: 0,
    title: 'How do you identify?',
    kind: 'single',
    required: true,
    options: ['Woman', 'Man', 'Non-binary', 'Prefer not to say', 'Other'],
    otherKey: 'genderOther',
    otherPlaceholder: 'How would you like to describe your gender?',
  },
  {
    id: 'age',
    section: 0,
    title: 'What is your age?',
    helper: 'Please enter a number between 18 and 80.',
    kind: 'text',
    required: true,
    placeholder: 'Age in years',
    validate: (value) => {
      const raw = typeof value === 'string' ? value.trim() : '';
      const parsed = Number.parseInt(raw, 10);
      if (!raw) return 'Age is required.';
      if (!Number.isFinite(parsed) || parsed < 18 || parsed > 80) return 'Please enter a valid age between 18 and 80.';
      return null;
    },
  },
  {
    id: 'city',
    section: 0,
    title: 'Which city do you currently live in?',
    kind: 'text',
    required: true,
    placeholder: 'Mumbai, Bengaluru, Delhi, etc.',
  },
  {
    id: 'lifeStage',
    section: 1,
    title: 'Which best describes your life stage?',
    kind: 'single',
    required: true,
    options: [
      'Single',
      'In a relationship (not married)',
      'Married or partnered (no children)',
      'Married or partnered (with children)',
      'Single parent',
      'Prefer not to say',
      'Other',
    ],
    otherKey: 'lifeStageOther',
    otherPlaceholder: 'Tell us your life stage',
  },
  {
    id: 'livingSetupSingle',
    section: 1,
    title: 'If you are single/early-stage, which best describes your current living setup?',
    kind: 'single',
    required: true,
    condition: (answers) => answers.lifeStage === 'Single' || answers.lifeStage === 'In a relationship (not married)',
    options: [
      'Single person living alone',
      'Single person living with roommates/flatmates',
      'Single person living with parents/family',
      'Other',
    ],
    otherKey: 'livingSetupSingleOther',
    otherPlaceholder: 'Please specify your living setup',
  },
  {
    id: 'livingSetupFamily',
    section: 1,
    title: 'If you are partnered/family-stage, which best describes your current living setup?',
    kind: 'single',
    required: true,
    condition: (answers) =>
      answers.lifeStage === 'Married or partnered (no children)' ||
      answers.lifeStage === 'Married or partnered (with children)' ||
      answers.lifeStage === 'Single parent',
    options: [
      'Married/partnered living alone (without parents)',
      'Married/partnered living with parents/extended family',
      'Married/partnered with children living independently',
      'Married/partnered with children living with parents/extended family',
      'Other',
    ],
    otherKey: 'livingSetupFamilyOther',
    otherPlaceholder: 'Please specify your living setup',
  },
  {
    id: 'childrenAgeBands',
    section: 1,
    title: 'If you have children, which age groups apply?',
    helper: 'Choose all that apply.',
    kind: 'multi',
    condition: (answers) => answers.lifeStage === 'Married or partnered (with children)' || answers.lifeStage === 'Single parent',
    options: ['Children under 5', 'Children age 5-12', 'Teenagers at home', 'Other'],
    otherKey: 'childrenAgeBandsOther',
    otherPlaceholder: 'Any other child age group context?',
  },
  {
    id: 'householdAttributes',
    section: 1,
    title: 'Which of these apply to your household?',
    helper: 'Choose all that apply.',
    kind: 'multi',
    options: [
      'Have pets',
      'Elderly parents at home',
      'Domestic help/cook support',
      'Other',
    ],
    otherKey: 'householdAttributesOther',
    otherPlaceholder: 'Anything else about your household?',
  },
  {
    id: 'routine',
    section: 1,
    title: 'Which of these are part of your weekly routine?',
    helper: 'Choose all that apply.',
    kind: 'multi',
    required: true,
    options: ['Cooking at home', 'Meal prep', 'Gym or fitness classes', 'Running or sports', 'Hosting friends and family', 'Other'],
    otherKey: 'routineOther',
    otherPlaceholder: 'What else is in your routine?',
  },
  {
    id: 'modular',
    section: 2,
    title: 'Do you currently have a modular kitchen?',
    kind: 'single',
    required: true,
    options: ['Yes', 'No', 'Planning one in the next 2 years'],
  },
  {
    id: 'aesthetics',
    section: 2,
    title: 'How important is kitchen aesthetics to you?',
    helper: '1 = not important, 10 = extremely important',
    kind: 'rating',
    required: true,
  },
  {
    id: 'upgrades',
    section: 2,
    title: 'What have you upgraded in your kitchen in the last 18 months?',
    kind: 'multi',
    options: ['Water purifier', 'Cookware', 'Storage containers', 'Small appliances', 'Large appliances', 'Nothing recently', 'Other'],
    otherKey: 'upgradesOther',
    otherPlaceholder: 'What else did you upgrade?',
  },
  {
    id: 'income',
    section: 3,
    title: 'What is your annual household income range?',
    kind: 'single',
    required: true,
    options: ['Under Rs10L', 'Rs10-20L', 'Rs20-40L', 'Rs40L+'],
  },
  {
    id: 'buyStyle',
    section: 3,
    title: 'When you buy products, what do you optimize for?',
    helper: 'Select up to 2.',
    kind: 'multi',
    required: true,
    max: 2,
    options: ['I optimize for design', 'I optimize for quality', 'I optimize for health', 'I optimize for convenience', 'Lowest price', 'Other'],
    otherKey: 'buyStyleOther',
    otherPlaceholder: 'What else drives your buying decision?',
  },
  {
    id: 'premiumFor',
    section: 3,
    title: 'Where are you comfortable paying a premium?',
    kind: 'multi',
    options: ['Kitchen', 'Home', 'Fitness', 'Skincare', 'Travel', 'Electronics', 'Other'],
    otherKey: 'premiumForOther',
    otherPlaceholder: 'Any other premium categories?',
  },
  {
    id: 'purchases',
    section: 3,
    title: 'Which of these do you buy at least once a month?',
    kind: 'multi',
    options: ['Protein supplements', 'Healthy snacks', 'Organic foods', 'Zero-sugar products', 'Vitamins', 'None of these', 'Other'],
    otherKey: 'purchasesOther',
    otherPlaceholder: 'What else do you buy monthly?',
  },
  {
    id: 'labels',
    section: 3,
    title: 'How often do you read ingredient or nutrition labels?',
    kind: 'single',
    options: ['Always', 'Often', 'Sometimes', 'Rarely', 'Never'],
  },
  {
    id: 'airFryerOwnership',
    section: 4,
    title: 'Do you currently own an air fryer?',
    kind: 'single',
    required: true,
    options: ['Yes', 'No'],
  },
  {
    id: 'airFryerPlace',
    section: 4,
    title: 'Where is your air fryer usually kept?',
    kind: 'single',
    condition: (answers) => answers.airFryerOwnership === 'Yes',
    options: ['Permanently on countertop', 'Stored away after use', 'Other'],
    otherKey: 'airFryerPlaceOther',
    otherPlaceholder: 'Please specify where it is kept',
  },
  {
    id: 'airFryerPain',
    section: 4,
    title: 'What are your biggest pain points with air fryers?',
    kind: 'multi',
    condition: (answers) => answers.airFryerOwnership === 'Yes',
    options: ['Difficult to clean', 'Plastic smell or taste', 'Food safety concerns', 'Uneven cooking', 'Bulky on the counter', 'No major issues', 'Other'],
    otherKey: 'airFryerPainOther',
    otherPlaceholder: 'Any other pain points?',
  },
  {
    id: 'airFryerBarrier',
    section: 4,
    title: 'If you have not bought one yet, what stops you?',
    kind: 'multi',
    condition: (answers) => answers.airFryerOwnership === 'No',
    options: ['Too expensive', 'Not sure about health impact', 'Counter space constraints', 'Cleaning seems hard', 'Do not see enough value', 'Other'],
    otherKey: 'airFryerBarrierOther',
    otherPlaceholder: 'Any other barriers?',
  },
  {
    id: 'materialUpgrade',
    section: 5,
    title: 'Have you upgraded products specifically for better or safer materials?',
    kind: 'single',
    options: ['Yes', 'No', 'Not sure'],
  },
  {
    id: 'admired',
    section: 5,
    title: 'Which brands do you admire for design and product quality?',
    kind: 'multi',
    options: ['Apple', 'Dyson', 'Dreame', 'Laifen', 'Nuuk', 'IKEA', 'None in particular', 'Others'],
    otherKey: 'admiredOther',
    otherPlaceholder: 'Which other brands do you admire?',
  },
  {
    id: 'conceptInterest',
    section: 6,
    title: 'How interested are you in a premium glass-basket air fryer with Indian presets?',
    kind: 'rating',
    required: true,
  },
  {
    id: 'conceptFeedback',
    section: 6,
    title: 'What would make this concept a no-brainer for you?',
    kind: 'text',
    multiline: true,
    placeholder: 'Share feature ideas, concerns, and must-haves',
  },
];
