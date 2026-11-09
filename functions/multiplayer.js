'use strict';

function validateRoom(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Room details are required.');
  const title = String(input.title || '').trim();
  if (!title || title.length > 100) throw new Error('Quiz title must be 1 to 100 characters.');
  if (!/^\d{4}$/.test(String(input.pin || ''))) throw new Error('Room PIN must be four digits.');
  if (!Number.isInteger(input.capacity) || input.capacity < 1 || input.capacity > 200) throw new Error('Room capacity must be 1 to 200.');
  if (!Number.isInteger(input.secondsPerQuestion) || input.secondsPerQuestion < 5 || input.secondsPerQuestion > 120) throw new Error('Timer must be 5 to 120 seconds.');
  if (!Array.isArray(input.questions) || input.questions.length < 1 || input.questions.length > 1500) throw new Error('Question count must be 1 to 1,500.');
  for (const q of input.questions) {
    if (!q || typeof q.text !== 'string' || !q.text.trim() || !Array.isArray(q.options) || q.options.length !== 4 || q.options.filter(o => o && o.correct === true).length !== 1 || q.options.some(o => !o || typeof o.text !== 'string' || !o.text.trim())) throw new Error('Every question must have text, four options, and exactly one correct answer.');
  }
  return { title, pin: String(input.pin), capacity: input.capacity, secondsPerQuestion: input.secondsPerQuestion, difficulty: String(input.difficulty || 'Easy').slice(0, 30), questions: input.questions.map(q => ({ text: q.text.slice(0, 2000), options: q.options.map(o => ({ text: o.text.slice(0, 500), correct: o.correct === true })) })) };
}

function publicQuestion(question) {
  return { text: question.text, options: question.options.map(o => ({ text: o.text })) };
}

function answerOutcome({ correct, firstCorrectUid }) {
  const firstCorrect = Boolean(correct && !firstCorrectUid);
  return { correct: Boolean(correct), firstCorrect, scoreDelta: firstCorrect ? 5 : 0 };
}

module.exports = { validateRoom, publicQuestion, answerOutcome };
