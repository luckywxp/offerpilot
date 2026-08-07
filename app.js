const storeKey = 'offerPilotData';
const initialData = { interviews: [], resumes: [], applications: [] };
let data = JSON.parse(localStorage.getItem(storeKey) || JSON.stringify(initialData));
let currentInterview = null;
let recognition = null;
let voiceModeActive = false;
let isListening = false;
let manualEditing = false;
let manualTimer = null;

const questions = [
  '请先做一个 1 分钟自我介绍，并重点说明你为什么适合这个岗位。',
  '结合 JD，讲一个最能证明你岗位能力的项目或实习经历。',
  '你在团队协作中遇到过什么冲突？你是如何解决的？',
  '如果入职后发现工作内容和预期不同，你会怎么处理？',
  '你有什么想反问面试官的问题？'
];

function saveData() { localStorage.setItem(storeKey, JSON.stringify(data)); renderAll(); }
function $(id) { return document.getElementById(id); }
function toast(text) { const el = $('toast'); el.textContent = text; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 1800); }

function switchPage(pageId) {
  document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page.id === pageId));
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.page === pageId));
}

document.querySelectorAll('[data-page]').forEach(btn => btn.addEventListener('click', () => switchPage(btn.dataset.page)));
document.querySelectorAll('[data-jump]').forEach(btn => btn.addEventListener('click', () => switchPage(btn.dataset.jump)));

$('interviewForm').addEventListener('submit', event => {
  event.preventDefault();
  currentInterview = {
    id: Date.now(),
    jobTitle: $('jobTitle').value.trim(),
    companyName: $('companyName').value.trim(),
    jd: $('jobDescription').value.trim(),
    type: $('interviewType').value,
    mode: $('answerMode').value,
    linkedResume: $('linkedResume').value,
    messages: [],
    createdAt: new Date().toLocaleString()
  };
  $('chatBox').innerHTML = '';
  const opening = `你好，我是本次${currentInterview.type}面试官。${questions[0]}`;
  addMessage('ai', opening);
  updateVoiceStatus('待回答', 'listening-idle');
  setInterviewerLine('面试已开始。你可以点击面对面语音面试，让我语音提问并自动听你回答。');
  toast('面试已开始');
});

function addMessage(role, text) {
  if (!currentInterview) return;
  currentInterview.messages.push({ role, text });
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.textContent = text;
  $('chatBox').appendChild(div);
  $('chatBox').scrollTop = $('chatBox').scrollHeight;
}

$('sendAnswer').addEventListener('click', () => {
  submitAnswer(false);
});

$('answerInput').addEventListener('input', () => {
  manualEditing = true;
  if (manualTimer) clearTimeout(manualTimer);
  manualTimer = setTimeout(() => { manualEditing = false; }, 1200);
});

$('finishInterview').addEventListener('click', () => {
  if (!currentInterview) return toast('还没有进行中的面试');
  voiceModeActive = false;
  window.speechSynthesis?.cancel();
  if (recognition && isListening) recognition.stop();
  updateVoiceStatus('已结束', 'listening-idle');
  manualEditing = false;
  if (manualTimer) clearTimeout(manualTimer);
  const answers = currentInterview.messages.filter(m => m.role === 'user').map(m => m.text).join('\n');
  currentInterview.review = buildReview(answers, currentInterview.jd);
  data.interviews.unshift(currentInterview);
  currentInterview = null;
  saveData();
  switchPage('reviews');
  toast('复盘已生成');
});

function buildReview(answers, jd) {
  const short = answers.length < 180;
  return [
    short ? '回答内容偏短，需要补充背景、行动和结果，避免只给结论。' : '回答内容较完整，建议进一步突出与岗位 JD 的关键词匹配。',
    '建议使用 STAR 结构：情境、任务、行动、结果，让经历更有层次。',
    '每段经历最好补充量化结果，例如效率提升、用户增长、转化率、节省时间等。',
    jd ? '复盘时建议把 JD 中的核心能力拆成 3 个关键词，并在回答中主动呼应。' : '建议下次粘贴完整 JD，AI 可以更精准判断岗位匹配度。',
    '表达上可以减少口头铺垫，先给结论，再展开例子，会更像真实面试中的高质量回答。'
  ];
}

function updateVoiceStatus(text, state) {
  const status = $('voiceStatus');
  const avatar = $('avatarFace');
  if (status) status.textContent = text;
  if (avatar) avatar.className = `avatar-face ${state || 'listening-idle'}`;
}

function setInterviewerLine(text) {
  const line = $('interviewerLine');
  if (line) line.textContent = text;
}

function getSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition;
}

function speak(text, afterSpeak) {
  if (!('speechSynthesis' in window)) {
    setInterviewerLine('当前浏览器不支持 AI 语音播报，但仍可使用文字面试。');
    afterSpeak?.();
    return;
  }
  window.speechSynthesis.cancel();
  updateVoiceStatus('面试官提问中', 'speaking');
  setInterviewerLine(text);
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-CN';
  utterance.rate = 1;
  utterance.pitch = 1.05;
  utterance.onend = () => {
    updateVoiceStatus('正在听你回答', 'listening');
    afterSpeak?.();
  };
  window.speechSynthesis.speak(utterance);
}

function startListening() {
  const Recognition = getSpeechRecognition();
  if (!Recognition) {
    setInterviewerLine('当前浏览器不支持自动语音识别，建议使用 Chrome 或 Edge 打开。');
    updateVoiceStatus('语音识别不可用', 'listening-idle');
    return;
  }
  if (recognition && isListening) return;
  recognition = new Recognition();
  recognition.lang = 'zh-CN';
  recognition.continuous = false;
  recognition.interimResults = true;
  let finalText = '';
  isListening = true;
  recognition.onresult = event => {
    let interimText = '';
    for (let index = event.resultIndex; index < event.results.length; index++) {
      const text = event.results[index][0].transcript;
      if (event.results[index].isFinal) finalText += text;
      else interimText += text;
    }
    const field = $('answerInput');
    if (!manualEditing || !field.value.trim()) field.value = finalText || interimText;
  };
  recognition.onerror = () => {
    isListening = false;
    updateVoiceStatus('未听清，可重试', 'listening-idle');
    setInterviewerLine('我没有听清你的回答，你可以再说一遍，或用文字提交。');
  };
  recognition.onend = () => {
    isListening = false;
    if (!voiceModeActive) return;
    const answer = $('answerInput').value.trim();
    if (answer && !manualEditing) submitAnswer(true);
    else {
      updateVoiceStatus('等待回答', 'listening');
      setTimeout(startListening, 600);
    }
  };
  recognition.start();
}

function submitAnswer(fromVoice = false) {
  if (!currentInterview) return toast('请先生成面试问题');
  const answer = $('answerInput').value.trim();
  if (!answer) return toast('请先输入回答');
  manualEditing = false;
  addMessage('user', answer);
  $('answerInput').value = '';
  const userCount = currentInterview.messages.filter(m => m.role === 'user').length;
  const nextQuestion = questions[userCount] || '我想追问一下：你刚才提到的经历中，结果如何量化？如果重来一次，你会如何优化？';
  addMessage('ai', nextQuestion);
  if (voiceModeActive || fromVoice) speak(nextQuestion, startListening);
}

$('startVoiceInterview').addEventListener('click', () => {
  if (!currentInterview) return toast('请先填写信息并生成面试问题');
  voiceModeActive = true;
  manualEditing = false;
  if (manualTimer) clearTimeout(manualTimer);
  const lastAiMessage = [...currentInterview.messages].reverse().find(message => message.role === 'ai');
  $('recordHint').textContent = '面对面语音模式已开启：面试官说完后，你直接回答即可。停顿后系统会自动提交并追问。';
  speak(lastAiMessage?.text || questions[0], startListening);
});

$('pauseVoiceInterview').addEventListener('click', () => {
  voiceModeActive = false;
  manualEditing = false;
  if (manualTimer) clearTimeout(manualTimer);
  window.speechSynthesis?.cancel();
  if (recognition && isListening) recognition.stop();
  updateVoiceStatus('已暂停', 'listening-idle');
  setInterviewerLine('语音面试已暂停。你可以继续文字回答，或再次开启面对面语音面试。');
});

$('diagnoseResume').addEventListener('click', () => {
  const content = $('resumeContent').value.trim();
  const jd = $('resumeJD').value.trim();
  $('resumePreview').value = `简历诊断建议\n\n1. 经历描述建议补充“动作 + 方法 + 结果”，避免只罗列职责。\n2. 项目和实习经历需要突出与目标岗位相关的关键词。\n3. 每段经历建议增加量化结果，例如提升、增长、节省、覆盖人数等。\n4. 技能部分建议按岗位 JD 重新排序，把最匹配的能力放前面。\n5. ${jd ? '当前已提供 JD，可以进一步把简历改写成更贴合岗位的一版。' : '建议粘贴 JD 后再进行岗位定制改写。'}\n\n原始简历摘要：\n${content.slice(0, 500) || '暂无内容'}`;
});

$('rewriteResume').addEventListener('click', () => {
  const content = $('resumeContent').value.trim();
  $('resumePreview').value = `岗位定制简历草稿\n\n个人优势\n- 具备快速学习、结构化表达和跨团队协作能力，能够围绕业务目标推进任务落地。\n\n经历优化示例\n- 基于目标岗位需求，重新梳理项目背景、个人职责、关键行动与量化结果。\n- 将原有经历中的执行动作升级为能力表达，例如数据分析、用户洞察、流程优化、项目推进。\n\n可继续编辑内容\n${content || '请在左侧粘贴简历内容，系统会在这里生成可编辑版本。'}`;
});

$('saveResume').addEventListener('click', () => {
  const name = $('resumeName').value.trim() || `简历版本 ${data.resumes.length + 1}`;
  const content = $('resumePreview').value.trim() || $('resumeContent').value.trim();
  if (!content) return toast('请先填写或生成简历内容');
  data.resumes.unshift({ id: Date.now(), name, content, createdAt: new Date().toLocaleString() });
  saveData();
  toast('简历版本已保存');
});

$('downloadWord').addEventListener('click', () => {
  const content = ($('resumePreview').value || $('resumeContent').value || '').replace(/\n/g, '<br>');
  if (!content) return toast('请先填写简历内容');
  const html = `<html><head><meta charset='utf-8'></head><body>${content}</body></html>`;
  const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${$('resumeName').value.trim() || '我的简历'}.doc`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$('applicationForm').addEventListener('submit', event => {
  event.preventDefault();
  const status = $('appStatus').value;
  data.applications.unshift({
    id: Date.now(), job: $('appJob').value.trim(), company: $('appCompany').value.trim(), city: $('appCity').value.trim(),
    date: $('appDate').value, url: $('appUrl').value.trim(), jd: $('appJD').value.trim(), notes: $('appNotes').value.trim(),
    timeline: [{ status, time: new Date().toLocaleDateString() }]
  });
  event.target.reset();
  saveData();
  toast('投递记录已添加');
});

function addProgress(id) {
  const app = data.applications.find(item => item.id === id);
  const status = prompt('请输入新进度：待投递 / 已投递 / 笔试 / 一面 / 二面 / 三面 / Offer / 已结束');
  if (!app || !status) return;
  app.timeline.push({ status, time: new Date().toLocaleDateString() });
  saveData();
}

function deleteApplication(id) {
  if (!confirm('确认删除这条投递记录吗？')) return;
  data.applications = data.applications.filter(item => item.id !== id);
  saveData();
}

window.addProgress = addProgress;
window.deleteApplication = deleteApplication;

function renderAll() {
  $('statInterviews').textContent = data.interviews.length;
  $('statApplications').textContent = data.applications.length;
  $('statResume').textContent = data.resumes.length;
  $('statFollowups').textContent = data.applications.filter(app => !['已结束', 'Offer'].includes(app.timeline.at(-1)?.status)).length;
  renderReviews(); renderApplications(); renderResumeSelect();
}

function renderReviews() {
  const list = $('reviewList');
  const recent = $('recentReviews');
  if (!data.interviews.length) {
    list.innerHTML = '<div class="empty">暂无复盘记录。</div>';
    recent.innerHTML = '还没有复盘记录，先完成一次模拟面试吧。';
    return;
  }
  list.innerHTML = data.interviews.map(item => `<article class="review-card"><h3>${item.jobTitle}｜${item.companyName}</h3><p>${item.createdAt} · ${item.type} · ${item.mode}</p><ul>${item.review.map(text => `<li>${text}</li>`).join('')}</ul></article>`).join('');
  const first = data.interviews[0];
  recent.innerHTML = `<strong>${first.jobTitle}｜${first.companyName}</strong><p>${first.review[0]}</p>`;
}

function renderApplications() {
  const tbody = $('applicationTable');
  if (!data.applications.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty">暂无投递记录。</td></tr>'; return; }
  tbody.innerHTML = data.applications.map(app => {
    const latest = app.timeline.at(-1)?.status || '待投递';
    const timeline = app.timeline.map(t => `<span>${t.time} ${t.status}</span>`).join('');
    return `<tr><td><strong>${app.job}</strong><div class="timeline">${timeline}</div></td><td>${app.company}</td><td>${app.city || '-'}</td><td>${app.date || '-'}</td><td><span class="badge">${latest}</span></td><td>${app.url ? `<a href="${app.url}" target="_blank">打开</a>` : '-'}</td><td><button class="secondary" onclick="addProgress(${app.id})">加进度</button> <button class="ghost" onclick="deleteApplication(${app.id})">删除</button></td></tr>`;
  }).join('');
}

function renderResumeSelect() {
  $('linkedResume').innerHTML = '<option value="">不关联简历</option>' + data.resumes.map(resume => `<option value="${resume.id}">${resume.name}</option>`).join('');
}

renderAll();





