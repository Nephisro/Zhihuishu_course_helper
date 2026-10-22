const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const core=require('../extension/core.js');
const url='https://wisdom-mooc.zhihuishu.com/study/index?recruitAndCourseId=test-course';
const from=JSON.stringify(['3.1','第一节']),to=JSON.stringify(['3.2','第二节']);
function harness({attachError=false,navigation=false,sameSource=false,pointError=false,plans=[],opening=false,flowPhase='active'}={}) {
  let handler,clock=100000,reads=0,detach=0,attach=0,planIndex=0;const commands=[],data={zhsSwitchLog:[]},flowCalls=[];
  const sender={id:'test-extension',url,tab:{id:1,url}};
  const context={globalThis:null,URL,ZhsCourseCore:core,ZhsChapterFlow:{arm:async value=>{flowCalls.push(value);return {id:'flow-1'};},state:async()=>({phase:flowPhase,error:'未能确认测试页'}),cancel:async()=>{}},Date:class extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}},setTimeout:fn=>{clock+=1000;queueMicrotask(fn);},
    chrome:{runtime:{id:'test-extension',onMessage:{addListener:fn=>handler=fn}},storage:{local:{get:async()=>data,set:async value=>Object.assign(data,value)}},debugger:{
      attach:async()=>{attach++;if(attachError)throw Error('occupied');},detach:async()=>{detach++;},
      sendCommand:async(target,method,args)=>{
        commands.push({method,args});
        if(method==='Runtime.evaluate') {
          if(args.expression.includes('const classify=')){
            if(pointError)return {exceptionDetails:{exception:{description:'Error: 目标课节被遮挡，取消点击'}}};
            return {result:{value:{action:'lesson',x:100,y:200,url,src:'old-video',...plans[Math.min(planIndex++,plans.length-1)]}}};
          }
          reads++;
          return {result:{value:reads===1?{url,current:from,video:{src:'old-video',ended:true,ready:4}}:{url:navigation?'https://onlineweb.zhihuishu.com/onlinestuh5':url,current:opening?from:to,video:{src:sameSource?'old-video':'new-video',ended:false,ready:4,time:1}}}};
        }
        return {};
      }
    }}};
  context.globalThis=context;vm.runInNewContext(fs.readFileSync(require.resolve('../extension/input-controller.js'),'utf8'),context);
  return {data,commands,flowCalls,get detach(){return detach;},get attach(){return attach;},
    sendChapter:()=>new Promise(resolve=>handler({type:'zhsOpenChapterTest',from,chapter:JSON.stringify(['第三章:','示例章节'])},sender,resolve)),
    send:()=>new Promise(resolve=>handler({type:'zhsNextVideo',from,to},sender,resolve)),denied:()=>handler({type:'zhsNextVideo',from,to},{id:'other',url,tab:{id:1}},()=>{throw Error('unexpected reply');})};
}
test('browser input sends move/press/release and verifies new video source',async()=>{
  const h=harness(),r=await h.send();assert.equal(r.ok,true);assert.equal(r.target,to);assert.equal(h.attach,1);assert.equal(h.detach,1);
  const input=h.commands.filter(c=>c.method==='Input.dispatchMouseEvent');
  assert.deepEqual(input.map(c=>c.args.type),['mouseMoved','mousePressed','mouseReleased']);
  assert.equal(input[1].args.buttons,1);assert.equal(input[2].args.buttons,0);
  assert.equal(h.data.zhsSwitchLog.at(-1).event,'switch_confirmed');
});
test('homepage navigation is detected, logged and not retried',async()=>{
  const h=harness({navigation:true}),r=await h.send();assert.equal(r.ok,false);assert.match(r.error,/离开课程页/);assert.equal(h.commands.filter(c=>c.method==='Input.dispatchMouseEvent').length,3);
  assert.ok(h.data.zhsSwitchLog.some(e=>e.event==='navigation_away'));assert.equal(h.detach,1);
});
test('same old video source cannot be accepted as successful switch',async()=>{
  const h=harness({sameSource:true}),r=await h.send();assert.equal(r.ok,false);assert.match(r.error,/20 秒/);assert.equal(h.commands.filter(c=>c.method==='Input.dispatchMouseEvent').length,3);assert.equal(h.detach,1);
});
test('occupied debugger stops without page click fallback',async()=>{
  const h=harness({attachError:true}),r=await h.send();assert.equal(r.ok,false);assert.match(r.error,/无法连接浏览器输入/);assert.equal(h.commands.length,0);assert.equal(h.detach,0);
});
test('obscured or invalid next lesson is rejected before sending input',async()=>{
  const h=harness({pointError:true}),r=await h.send();assert.equal(r.ok,false);assert.equal(h.commands.filter(c=>c.method==='Input.dispatchMouseEvent').length,0);assert.equal(h.detach,1);
});
test('other extensions cannot request browser-level course clicks',()=>{const h=harness();assert.equal(h.denied(),false);assert.equal(h.attach,0);});

test('chapter entry uses one browser click and waits for the owned tab handshake',async()=>{
  const h=harness({opening:true}),result=await h.sendChapter();assert.equal(result.ok,true);assert.equal(result.id,'flow-1');assert.equal(h.flowCalls.length,1);
  assert.equal(h.flowCalls[0].sourceTabId,1);assert.equal(h.commands.filter(c=>c.method==='Input.dispatchMouseEvent'&&c.args.type==='mousePressed').length,1);assert.equal(h.detach,1);
});

test('an unconfirmed or failed test tab never causes another click',async()=>{
  for(const flowPhase of ['opening','failed']){
    const h=harness({opening:true,flowPhase}),result=await h.sendChapter();assert.equal(result.ok,false);
    assert.equal(h.commands.filter(c=>c.method==='Input.dispatchMouseEvent'&&c.args.type==='mousePressed').length,1);assert.equal(h.detach,1);
  }
});

test('real chapter test-box is targeted only for its own final video',async()=>{
  const h=harness({opening:true});await h.sendChapter();
  const expression=h.commands.find(c=>c.method==='Runtime.evaluate'&&c.args.expression.includes('const classify=')).args.expression;
  const chapter={querySelector:s=>s==='.chapter-title'?{textContent:'第三章:'}:s==='.chapter-name'?{textContent:'示例章节'}:null,querySelectorAll:s=>s==='.test-box'?[testBox]:[]};
  const testBox={textContent:'测试',getClientRects:()=>[{}],matches:()=>false,getAttribute:()=>null,closest:s=>s==='.el-collapse-item'?chapter:null,getBoundingClientRect:()=>({left:20,right:200,top:200,bottom:240}),contains:e=>e===testBox};
  const item=(number,title,current)=>({className:'chapter-item',classList:{contains:c=>c==='current'&&current},getAttribute:()=>null,closest:s=>s==='.el-collapse-item'?chapter:null,querySelector:s=>s==='.item-num'?{textContent:number}:s==='.item-name'?{textContent:title}:testBox});
  const entries=[item('3.1','第一节',true)];
  const page={location:{href:url},innerWidth:800,innerHeight:600,getComputedStyle:()=>({visibility:'visible'}),document:{querySelectorAll:s=>s==='.chapter-item'?entries:s==='video'?[{getClientRects:()=>[{}],ended:true,currentSrc:'old-video'}]:[],elementFromPoint:()=>testBox}};
  assert.equal(vm.runInNewContext(expression,page).x,110);
  entries.push(item('3.2','第二节',false));assert.throws(()=>vm.runInNewContext(expression,page),/本章末节/);
});
test('generated DOM validation expression finds only the actual next video and rejects overlays',async()=>{
  const h=harness();await h.send();const expression=h.commands.find(c=>c.method==='Runtime.evaluate'&&c.args.expression.includes('const classify=')).args.expression;
  const target={getClientRects:()=>[{}],matches:()=>false,getBoundingClientRect:()=>({x:50,y:150,width:100,height:100}),contains:e=>e===target};
  function item(number,title,current){return {className:'chapter-item',closest:()=>null,classList:{contains:c=>c==='current'&&current},getAttribute:()=>null,querySelector:s=>s==='.item-num'?{textContent:number}:s==='.item-name'?{textContent:title}:target};}
  const entries=[item('3.1','第一节',true),item('3.15','章节测试',false),item('3.2','第二节',false)];let hit=target;
  const page={document:{querySelectorAll:s=>s==='.chapter-item'?entries:s==='video'?[{getClientRects:()=>[{}],ended:true,currentSrc:'old-video'}]:[],elementFromPoint:()=>hit},getComputedStyle:()=>({visibility:'visible'}),innerWidth:800,innerHeight:600,location:{href:url}};
  const point=vm.runInNewContext(expression,page);assert.equal(point.x,100);assert.equal(point.y,200);
  hit={};assert.throws(()=>vm.runInNewContext(expression,page),/被遮挡/);
});
test('scrolls catalog then expands chapter then revalidates and clicks lesson',async()=>{
  const h=harness({plans:[{action:'scroll',scrollTop:0,deltaY:500},{action:'expand',chapterId:'head-4'},{action:'wait'},{action:'lesson'}]});
  assert.equal((await h.send()).ok,true);
  const input=h.commands.filter(c=>c.method==='Input.dispatchMouseEvent');
  assert.deepEqual(input.map(c=>c.args.type),['mouseMoved','mouseWheel','mouseMoved','mousePressed','mouseReleased','mouseMoved','mousePressed','mouseReleased']);
  assert.ok(h.data.zhsSwitchLog.some(e=>e.event==='chapter_expand'));assert.ok(h.data.zhsSwitchLog.some(e=>e.event==='catalog_scroll'));
});
test('does not click same collapsed chapter repeatedly if expansion fails',async()=>{
  const h=harness({plans:[{action:'expand',chapterId:'head-4'}]});const result=await h.send();assert.equal(result.ok,false);assert.match(result.error,/展开没有生效/);
  assert.equal(h.commands.filter(c=>c.method==='Input.dispatchMouseEvent'&&c.args.type==='mousePressed').length,1);
});
test('stalled catalog wheel scrolling stops without clicking a lesson',async()=>{
  const h=harness({plans:[{action:'scroll',scrollTop:0,deltaY:500}]});const result=await h.send();assert.equal(result.ok,false);assert.match(result.error,/滚动没有进展/);
  assert.equal(h.commands.filter(c=>c.method==='Input.dispatchMouseEvent'&&c.args.type==='mousePressed').length,0);
});
async function catalogFixture() {
  const h=harness();await h.send();const expression=h.commands.find(c=>c.method==='Runtime.evaluate'&&c.args.expression.includes('const classify=')).args.expression;
  const state={expanded:false,scrollTop:900,blocked:false,animating:false};
  const rect=(top,height=50)=>({left:20,right:300,top,bottom:top+height,x:20,y:top,width:280,height});
  const pane={className:'chapter-wrapper',scrollHeight:2400,clientHeight:600,get scrollTop(){return state.scrollTop;},getClientRects:()=>[{}],getBoundingClientRect:()=>({left:20,right:320,top:100,bottom:700}),contains:e=>[pane,header,lesson].includes(e)};
  const header={id:'head-4',getAttribute:name=>name==='aria-expanded'?String(state.expanded):name==='aria-controls'?'content-4':'false',getClientRects:()=>[{}],getBoundingClientRect:()=>rect(1000-state.scrollTop),contains:e=>e===header};
  const lesson={getClientRects:()=>state.expanded?[{}]:[],matches:()=>false,getBoundingClientRect:()=>rect(1100-state.scrollTop),contains:e=>e===lesson};
  const chapter={querySelector:()=>header};
  const wrap={get clientHeight(){return state.animating?0:300;},scrollHeight:300};
  function item(number,title,current){return {className:'chapter-item',closest:s=>s==='.el-collapse-item'?chapter:s==='.chapter-wrapper'?pane:s==='.el-collapse-item__wrap'?wrap:null,classList:{contains:c=>c==='current'&&current},getAttribute:()=>null,querySelector:s=>s==='.item-num'?{textContent:number}:s==='.item-name'?{textContent:title}:lesson};}
  const entries=[item('3.1','第一节',true),item('3.15','章节测试',false),item('3.2','第二节',false)];
  const page={document:{getElementById:()=>({contains:e=>e===entries[2]}),querySelectorAll:s=>s==='.chapter-item'?entries:s==='video'?[{getClientRects:()=>[{}],ended:true,currentSrc:'old-video'}]:[],elementFromPoint:(x,y)=>{
    if(state.blocked)return {};
    const e=state.expanded?lesson:header,r=e.getBoundingClientRect();return y>=r.top&&y<=r.bottom?e:pane;
  }},getComputedStyle:e=>({visibility:'visible',overflowY:e===pane?'auto':e===wrap?'hidden':'visible'}),innerWidth:900,innerHeight:800,location:{href:url}};
  return {state,plan:()=>vm.runInNewContext(expression,page)};
}
test('real planner expands only the matching collapsed chapter then targets its lesson',async()=>{
  const f=await catalogFixture();assert.equal(f.plan().action,'expand');assert.equal(f.plan().chapterId,'head-4');
  f.state.expanded=true;assert.equal(f.plan().action,'lesson');
});
test('real planner scrolls within catalog in either direction and rejects a blocked pane',async()=>{
  const f=await catalogFixture();f.state.scrollTop=0;const down=f.plan();assert.equal(down.action,'scroll');assert.ok(down.deltaY>0);assert.ok(down.x>=20&&down.x<=320);assert.ok(down.y>=100&&down.y<=700);
  f.state.scrollTop=1500;assert.ok(f.plan().deltaY<0);f.state.blocked=true;assert.throws(()=>f.plan(),/目录被遮挡/);
});
test('planner waits for chapter opening animation before choosing a lesson position',async()=>{
  const f=await catalogFixture();f.state.expanded=true;f.state.animating=true;assert.equal(f.plan().action,'wait');f.state.animating=false;assert.equal(f.plan().action,'lesson');
});
