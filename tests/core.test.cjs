const {test} = require('node:test');
const assert = require('node:assert/strict');
const {normalize, validateBank, matchQuestion, parseApiAnswers,apiEndpoint} = require('../extension/core.js');
const bank = validateBank([{question:'题目（ ）',answers:['正确选项一','正确选项二']}]);
test('base URLs normalize without duplicating completion paths',()=>{
  for(const [input,expected] of [
    ['https://api.deepseek.com','https://api.deepseek.com/chat/completions'],
    ['https://api.deepseek.com/','https://api.deepseek.com/chat/completions'],
    ['https://api.deepseek.com/v1/','https://api.deepseek.com/v1/chat/completions'],
    ['https://api.example.test/v1/chat/completions/','https://api.example.test/v1/chat/completions']]) assert.equal(apiEndpoint(input),expected);
  for(const input of ['http://example.test','https://user:secret@example.test','https://example.test/?key=secret'])assert.throws(()=>apiEndpoint(input));
});
test('API option indices map to original text and reject invalid indices',()=>{
  const qs=[{question:'题',options:['甲','乙','丙'],multiple:true}];
  assert.deepEqual(parseApiAnswers('{"answers":[{"id":0,"selected":[2,0]}]}',qs)[0].answers,['丙','甲']);
  for(const selected of [[3],[0,0],[],['0']])assert.throws(()=>parseApiAnswers(JSON.stringify({answers:[{id:0,selected}]}),qs));
});
test('normalizes spaces, line breaks and full-width punctuation', () => {
  assert.equal(normalize('题目（\n ）'), normalize('题目( )'));
});
test('API JSON answers support code fences and reordered ids', () => {
  const questions=[{question:'单选',options:['甲','乙'],multiple:false},{question:'多选',options:['丙','丁'],multiple:true}];
  const parsed=parseApiAnswers('```json\n{"answers":[{"id":1,"answers":["丙","丁"]},{"id":0,"answers":["乙"]}]}\n```',questions);
  assert.equal(parsed.length,2);assert.deepEqual(parsed[0].answers,['丙','丁']);
});
test('API missing, invented, duplicate and uncertain answers are rejected', () => {
  const questions=[{question:'单选',options:['甲','乙'],multiple:false}];
  for (const answers of [[],[{id:0,answers:['丙']}],[{id:2,answers:['甲']}],[{id:0,answers:[]}],[{id:0,answers:['甲','乙']}]]) {
    assert.throws(()=>parseApiAnswers(JSON.stringify({answers}),questions));
  }
});
test('multi-select follows option text even after reordering', () => {
  assert.deepEqual(matchQuestion(bank,'题目( )',['正确选项二','干扰项','正确选项一'],true), {ok:true,indices:[2,0]});
});
test('unknown questions never guess', () => {
  assert.equal(matchQuestion(bank,'新题',['正确选项一'],true).ok,false);
});
test('all answers must exist before selecting anything', () => {
  assert.equal(matchQuestion(bank,'题目( )',['正确选项一','其他'],true).ok,false);
});
test('ambiguous option text requires manual handling', () => {
  assert.equal(matchQuestion(bank,'题目( )',['正确选项一','正确选项一','正确选项二'],true).ok,false);
});
test('multi-answer bank entry cannot answer single-select question', () => {
  assert.equal(matchQuestion(bank,'题目( )',['正确选项一','正确选项二'],false).ok,false);
});
test('invalid and duplicate bank entries are rejected', () => {
  for (const input of [{},[{question:'X',answers:[]}],[{question:'X',answers:['A','Ａ']}],
    [{question:'X',answers:['A']},{question:' X ',answers:['B']}], [{question:'X',answers:[123]}]]) {
    assert.throws(()=>validateBank(input));
  }
});
