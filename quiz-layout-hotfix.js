const express = require('express');
const previousStatic = express.static.bind(express);
const quizLayoutLink = '<link id="quizFullViewportLayout" rel="stylesheet" href="css/quiz-layout.css?v=2">';

function applyQuizBodyClass(html) {
  if (/class=["'][^"']*\bquiz-page\b/i.test(html)) return html;
  return html.replace(/<body([^>]*)>/i, (match, attributes) => {
    const classMatch = attributes.match(/class=(["'])(.*?)\1/i);
    if (classMatch) {
      const updatedAttributes = attributes.replace(/class=(["'])(.*?)\1/i, (value, quote, classes) => `class=${quote}${classes} quiz-page${quote}`);
      return `<body${updatedAttributes}>`;
    }
    return `<body class="quiz-page"${attributes}>`;
  });
}

express.static = function fullQuizStatic(root, options) {
  const fallback = previousStatic(root, options);
  return function deliverFullQuiz(req, res, next) {
    const pathname = (req.url || '').split('?')[0];
    if (req.method !== 'GET' || (pathname !== '/quiz.html' && pathname !== '/quiz')) return fallback(req, res, next);
    const originalSend = res.send.bind(res);
    res.send = function sendWithQuizLayout(body) {
      if (typeof body !== 'string') return originalSend(body);
      let updated = applyQuizBodyClass(body);
      if (!updated.includes('id="quizFullViewportLayout"')) {
        updated = updated.replace('</head>', `${quizLayoutLink}\n</head>`);
      }
      return originalSend(updated);
    };
    return fallback(req, res, next);
  };
};
