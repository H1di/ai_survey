export const QUESTIONS = [
  {
    id: 'age',
    category: 'Demographics',
    text: 'How old are you?',
    type: 'choice',
    options: ['Under 22', '22–28', '29–35', '36–45', '46+'],
  },
  {
    id: 'situation',
    category: 'Demographics',
    text: 'What is your current situation?',
    type: 'choice',
    options: ['Employed — want to change', 'Student', 'Freelancing / self-employed', 'Between things', 'Early career'],
  },
  {
    id: 'income_urgency',
    category: 'Constraints',
    text: 'How urgently do you need income?',
    type: 'choice',
    options: ['I need it now — within months', 'Within a year is fine', 'I can invest 1–2 years', 'Money is not the constraint right now'],
  },
  {
    id: 'values_primary',
    category: 'Values',
    text: 'What matters most to you in work?',
    type: 'choice',
    options: ['Freedom and autonomy', 'Stability and security', 'Financial success', 'Meaning and purpose', 'Impact on others', 'Recognition and status'],
  },
  {
    id: 'values_secondary',
    category: 'Values',
    text: 'And second most?',
    type: 'choice',
    options: ['Freedom and autonomy', 'Stability and security', 'Financial success', 'Meaning and purpose', 'Impact on others', 'Recognition and status'],
  },
  {
    id: 'risk_tolerance',
    category: 'Psychology',
    text: 'How do you feel about uncertainty?',
    type: 'choice',
    options: ['I avoid it — I need a plan', 'I can tolerate it with preparation', 'I thrive in it — chaos is fuel'],
  },
  {
    id: 'stress_tolerance',
    category: 'Psychology',
    text: 'What is your honest stress tolerance?',
    type: 'choice',
    options: ['Low — I need a calm environment', 'Medium — I handle pressure well', 'High — intensity motivates me'],
  },
  {
    id: 'social_energy',
    category: 'Psychology',
    text: 'Where does your energy come from?',
    type: 'choice',
    options: ['Solitude and deep focus', 'Small, close-knit groups', 'Wide networks and active collaboration'],
  },
  {
    id: 'discipline',
    category: 'Psychology',
    text: 'Are you self-directed or do you need structure?',
    type: 'choice',
    options: ['Very self-directed — I set my own agenda', 'I work best with some structure', 'I need clear expectations and oversight'],
  },
  {
    id: 'work_style',
    category: 'Preferences',
    text: 'What kind of work energizes you?',
    type: 'choice',
    options: ['Building something from scratch', 'Improving and optimizing existing systems', 'Teaching or helping people', 'Analyzing and solving complex problems', 'Creating — writing, design, art, code'],
  },
  {
    id: 'environment',
    category: 'Preferences',
    text: 'Where do you want to work?',
    type: 'choice',
    options: ['Fully remote, anywhere', 'Hybrid — some in-person', 'In an office with a team', 'Outdoors or physically active', 'My own space / studio'],
  },
  {
    id: 'learning_willingness',
    category: 'Constraints',
    text: 'Are you willing to study or train for 1–2 years to reach a new career?',
    type: 'choice',
    options: ['Yes — fully committed', 'Yes, but only part-time alongside work', 'Prefer not — I want to leverage what I already know', 'No — I need to move now'],
  },
  {
    id: 'relocation',
    category: 'Constraints',
    text: 'Can you relocate if the right opportunity requires it?',
    type: 'choice',
    options: ['Yes — I can go anywhere', 'Maybe — within my country', 'No — I need to stay where I am'],
  },
  {
    id: 'pace',
    category: 'Lifestyle',
    text: 'What pace of life do you want?',
    type: 'choice',
    options: ['Slow and deep — few things done very well', 'Varied — mix of intensity and rest', 'Fast and stimulating — always something new'],
  },
  {
    id: 'life_goal',
    category: 'Lifestyle',
    text: 'What is your deepest long-term goal?',
    type: 'choice',
    options: ['Build lasting wealth and financial freedom', 'Create something that outlasts me', 'Live with complete autonomy — my rules', 'Have positive impact on people or the world', 'Master something and be known for it'],
  },
];

export function getAdaptedQuestions(answers) {
  return QUESTIONS.filter(q => {
    if (q.id === 'values_secondary' && answers.values_primary) {
      return true;
    }
    return true;
  });
}
