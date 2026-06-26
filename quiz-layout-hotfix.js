const express = require('express');
const previousStatic = express.static.bind(express);
const quizLayoutLink = '<link id="quizFullViewportLayout" rel="stylesheet" href="css/quiz-layout.css?v=1">';

express.static = function fullQuizStatic(root, options) {
  const fallback = previousStatic(root, options);
  return function deliverFullQuiz(req, res, next) {
    const pathname = (req.url || '').split('?')[0];
    if (req.method !== 'GET' || (pathname !== '/quiz.html' && pathname !== '/quiz')) return fallback(req, res, next);
    const originalSend = res.send.bind(res);
    res.send = function sendWithQuizLayout(body) {
      if (typeof body === 'string' && !body.includes('id="quizFullViewportLayout"')) {
        return originalSend(body.replace('</head>', `${quizLayoutLink}\n</head>`));
      }
      return originalSend(body);
    };
    return fallback(req, res, next);
  };
};
