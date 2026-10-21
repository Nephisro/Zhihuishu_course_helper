const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

class E {
  constructor(text=''){this.nodeType=1;this.tagName='DIV';this.textContent=text;this.innerText=text;this.map={};this.style={};this.childNodes=text?[{nodeType:3,textContent:text}]:[];this.checked=false;this.clicks=0;}
  querySelectorAll(s){return this.map[s]||[];}querySelector(s){return this.querySelectorAll(s)[0]||null;}
  getClientRects(){return [{}];}getAttribute(){return null;}addEventListener(){}click(){this.clicks++;this.onClick?.();}
}
async function pageHarness({autoChapter=false,title='第一章单元测试',highlight=false}={}){
  const ids={},requests=[],timers=[],shadow=new WeakMap(),store={zhsCourseHelper:{autoQuiz:false,autoApi:autoChapter,autoChapter,bank:[]}};
  const document=new E(),root=new E();document.documentElement=root;root.append=()=>{};document.getElementById=()=>null;
  document.createElement=()=>{
    const host=new E();host.attachShadow=()=>({set innerHTML(html){for(const m of html.matchAll(/id="([^"]+)"/g))ids[m[1]]=new E();ids.autoSubmit.checked=true;},getElementById:id=>ids[id]});return host;
  };
  const stem=new E(),closed={nodeType:11,childNodes:[new E('封闭题干示例')]};shadow.set(stem,closed);
  const subject=new E(),number=new E('1.'),anchor=new E();anchor.id='sample-question';
  const nodes=['选项一','选项二'].map(text=>{
    const node=new E(),answer=new E(text),input=new E(),label=new E();input.checked=false;
    label.onClick=()=>{nodes.forEach(n=>{n.querySelector('input').checked=false;n.map['.onChecked']=[];});if(highlight)node.map['.onChecked']=[answer];else input.checked=true;};
    node.map['.examquestions-answer']=[answer];node.map.input=[input];node.map['.label']=[label];return node;
  });
  subject.map['.subject_describe']=[stem];subject.map['.subject_type']=[new E('【单选题】')];subject.map['.subject_num']=[number];subject.map['.subject_num span']=[anchor];subject.map['.subject_node .nodeLab']=nodes;
  const metadata=new E();metadata.map.label=[new E('题目数')];metadata.map.span=[new E('1')];
  const heading=new E(title);document.map.h1=[heading];document.map['.examPaper_subject']=[subject];document.map['.answerCard_list li']=[new E('1')];document.map.li=[metadata];document.map['.percentage_tit em']=[new E('0%')];
  const sandbox={globalThis:null,document,location:new URL('https://onlineexamh5new.zhihuishu.com/stuExamWeb.html#/webExamList/dohomework/example'),window:{addEventListener(){}},
    getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1'}),setInterval:fn=>{timers.push(fn);return 1;},clearInterval(){},
    chrome:{dom:{openOrClosedShadowRoot:e=>shadow.get(e)||null},storage:{onChanged:{addListener(){}},local:{get:async()=>store,set:async value=>Object.assign(store,value)}},
      runtime:{sendMessage:async message=>{requests.push(message);return {ok:true,bank:[{question:'封闭题干示例',answers:['选项二']}]};}}},
  };
  sandbox.globalThis=sandbox;
  for(const file of ['core.js','chapter-engine.js','chapter-dom.js','chapter.js'])vm.runInNewContext(fs.readFileSync(require.resolve('../extension/'+file),'utf8'),sandbox);
  await new Promise(setImmediate);
  return {ids,requests,nodes,store,heading,poll:()=>timers[0]()};
}
test('chapter page reads closed question text and exposes API mode independently of local bank',async()=>{
  const h=await pageHarness();h.ids.inspect.onclick();assert.match(h.ids.status.textContent,/封闭题干示例/);assert.match(h.ids.status.textContent,/选项：2/);assert.match(h.ids.status.textContent,/可见验证码：无/);
  h.ids.autoApi.checked=true;await h.ids.autoApi.onchange();assert.equal(h.store.zhsCourseHelper.autoApi,true);assert.equal(h.store.zhsCourseHelper.autoQuiz,false);
  h.ids.toggle.onclick();await new Promise(setImmediate);
  assert.equal(h.requests.length,1);assert.equal(h.requests[0].type,'zhsChapterSolve');assert.equal(h.requests[0].questions[0].question,'封闭题干示例');
  assert.equal(h.nodes[0].querySelector('input').checked,false);assert.equal(h.nodes[1].querySelector('input').checked,true);
});
test('automatic chapter startup waits for SPA title and stays stopped after manual stop',async()=>{
  const h=await pageHarness({autoChapter:true,title:''});assert.equal(h.requests.length,0);
  h.heading.innerText='第一章单元测试';h.poll();await new Promise(setImmediate);assert.equal(h.requests.length,1);
  h.ids.toggle.onclick();h.poll();await new Promise(setImmediate);assert.equal(h.requests.length,1);assert.match(h.ids.status.textContent,/已停止/);
});
test('platform onChecked highlights count as selected even when hidden input.checked stays false',async()=>{
  const h=await pageHarness({highlight:true});h.ids.autoApi.checked=true;await h.ids.autoApi.onchange();h.ids.toggle.onclick();await new Promise(setImmediate);
  assert.equal(h.nodes[1].querySelector('input').checked,false);h.ids.inspect.onclick();assert.match(h.ids.status.textContent,/已选：1/);
});
