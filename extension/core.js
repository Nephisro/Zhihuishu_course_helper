(function (root) {
  'use strict';
  const normalize = value => String(value ?? '').normalize('NFKC').replace(/\s+/gu, '').trim();
  function apiEndpoint(input) {
    let url;
    try { url = new URL(String(input).trim()); } catch { throw new Error('请填写有效的 HTTPS Base URL 或完整接口地址'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('API 地址必须是无凭据和查询参数的 HTTPS 地址');
    const path = url.pathname.replace(/\/+$/, '');
    url.pathname = path.endsWith('/chat/completions') ? path : `${path}/chat/completions`;
    return url.href;
  }
  function catalogKind({number='',title='',kind=''}) {
    if (/(?:^|[\s_-])(?:test|exam|quiz|exercise|homework|assessment)(?:$|[\s_-])/i.test(kind) ||
        /(?:章节|章末|单元|课后|阶段|期末|期中|随堂)(?:测试|测验|考试|考核|练习)/.test(normalize(title)) ||
        /^(?:测试|测验|考试|作业|考核|练习)(?:\s|[\d一二三四五六七八九十（(:：]|$)/.test(String(title).trim())) return 'assessment';
    if (/^\d+(?:\.\d+)*$/.test(String(number).trim()) && normalize(title)) return 'video';
    return 'unknown';
  }
  function validateBank(input) {
    if (!Array.isArray(input)) throw new Error('题库必须是 JSON 数组');
    const seen = new Set();
    return input.map((entry, i) => {
      if (!entry || typeof entry.question !== 'string' || !normalize(entry.question) ||
          !Array.isArray(entry.answers) || !entry.answers.length ||
          entry.answers.some(a => typeof a !== 'string' || !normalize(a))) {
        throw new Error(`第 ${i + 1} 条需要 question 和非空 answers 字符串数组`);
      }
      const key = normalize(entry.question);
      if (seen.has(key)) throw new Error(`第 ${i + 1} 条题干重复`);
      seen.add(key);
      if (new Set(entry.answers.map(normalize)).size !== entry.answers.length) throw new Error(`第 ${i + 1} 条答案重复`);
      return {question: entry.question.trim(), answers: entry.answers.map(a => a.trim())};
    });
  }
  function matchQuestion(bank, question, options, multiple) {
    const entry = bank.find(e => normalize(e.question) === normalize(question));
    if (!entry) return {ok: false, reason: '题库未收录'};
    if (!multiple && entry.answers.length !== 1) return {ok: false, reason: '题型与题库答案数量不符'};
    const indices = [];
    for (const answer of entry.answers) {
      const hits = options.map((text, i) => normalize(text) === normalize(answer) ? i : -1).filter(i => i >= 0);
      if (hits.length !== 1) return {ok: false, reason: '答案选项缺失或存在重名'};
      indices.push(hits[0]);
    }
    return {ok: true, indices};
  }
  function parseApiAnswers(content, questions) {
    const value = JSON.parse(String(content).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    if (!Array.isArray(value.answers) || value.answers.length !== questions.length) throw new Error('API 返回的题目数量不完整');
    const seen = new Set();
    return value.answers.map(answer => {
      if (!Number.isInteger(answer.id) || answer.id < 0 || answer.id >= questions.length || seen.has(answer.id)) throw new Error('API 返回了无效题号');
      seen.add(answer.id);
      const q = questions[answer.id];
      let texts = answer.answers;
      if (answer.selected !== undefined) {
        if (!Array.isArray(answer.selected) || !answer.selected.length || new Set(answer.selected).size !== answer.selected.length ||
          answer.selected.some(i=>!Number.isInteger(i) || i<0 || i>=q.options.length)) throw new Error('API 返回了无效选项编号');
        texts = answer.selected.map(i=>q.options[i]);
      }
      const entry = validateBank([{question:q.question, answers:texts}])[0];
      if (!matchQuestion([entry],q.question,q.options,q.multiple).ok) throw new Error('API 答案与页面选项不一致');
      return entry;
    });
  }
  const api = {normalize, validateBank, matchQuestion, parseApiAnswers, apiEndpoint, catalogKind};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ZhsCourseCore = api;
})(globalThis);
