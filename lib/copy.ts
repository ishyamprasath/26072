import type { AppCommand } from "./commands";
import type { Lang } from "./view";

export type Copy = {
  product: string;
  region: string;
  disclaimer: string;
  forecast: string;
  scores: string;
  strategy: string;
  display: string;
  lead: string;
  play: string;
  pause: string;
  listen: string;
  listening: string;
  english: string;
  hindi: string;
  observed: string;
  model: string;
  flow: string;
  persistence: string;
  infrared: string;
  lightning: string;
  lightningNote: string;
  districts: string;
  chat: string;
  placeholder: string;
  send: string;
  suggestions: string[];
  sources: string;
  templateNote: string;
  noSpeech: string;
  emptyTitle: string;
  emptyBody: string;
  joining: string;
  roomTitle: string;
  roomHelp: string;
  roomLocal: string;
  noRoom: string;
  sliceAll: string;
  sliceInit: string;
  sliceDecay: string;
  testDay: string;
  demoDay: string;
  threshold: string;
  noEvents: string;
  hits: string;
  buildIndex: string;
  building: string;
  indexMissing: string;
  askStrategy: string;
  noCase: string;
  footprint: string;
};

const en: Copy = {
  product: "Thunderstorm nowcast",
  region: "20N to 28N, 84E to 96E. Leads +10 to +120 minutes.",
  disclaimer: "Research prototype for situational awareness. This is not an India Meteorological Department warning.",
  forecast: "Forecast",
  scores: "Scores",
  strategy: "Strategy",
  display: "Display room",
  lead: "Lead",
  play: "Play",
  pause: "Pause",
  listen: "Listen",
  listening: "Listening",
  english: "English",
  hindi: "Hindi",
  observed: "Observed",
  model: "Model",
  flow: "Optical flow",
  persistence: "Persistence",
  infrared: "Infrared",
  lightning: "Lightning",
  lightningNote: "No lightning flashes were observed for this case. This layer is not scored.",
  districts: "Districts on this lead",
  chat: "Ask",
  placeholder: "Ask about this forecast, or say a command.",
  send: "Send",
  suggestions: [
    "Where can a storm start in the next hour?",
    "CSI at 60 minutes versus optical flow",
    "What should farmers near Ranchi do in the next hour?",
  ],
  sources: "Sources",
  templateNote: "This reply is the fixed template. The language model was unavailable, or its draft added a figure or a link that is not in the forecast.",
  noSpeech: "This browser has no speech recognition. Type the same phrase.",
  emptyTitle: "The held-out case is not on this machine yet.",
  emptyBody: "Run the pipeline. The player will not draw a storm or a score until that case file exists.",
  joining: "Joining the display room.",
  roomTitle: "Phone remote",
  roomHelp: "Scan this code from a phone. Commands on the phone move this screen. A phone on another network needs a public HTTPS address for this server. Localhost works only on this computer.",
  roomLocal: "Room",
  noRoom: "Open the display room and scan its code to drive that screen.",
  sliceAll: "All cells",
  sliceInit: "Initiation",
  sliceDecay: "Decay",
  testDay: "Test afternoon",
  demoDay: "Held-out afternoon",
  threshold: "Threshold",
  noEvents: "No cells in this slice.",
  hits: "hits / misses / false alarms",
  buildIndex: "Build guidance index",
  building: "Reading public pages and embedding them.",
  indexMissing: "The guidance index is not on disk. Forecast numbers can still be read. No action text will be invented.",
  askStrategy: "What should a district officer do at this lead?",
  noCase: "The case file is not on disk, so there is no probability to quote.",
  footprint: "Each block is one Himawari full-disk pixel over this domain.",
};

const hi: Copy = {
  product: "तूफान नाउकास्ट",
  region: "20 उत्तर से 28 उत्तर, 84 पूर्व से 96 पूर्व। लीड +10 से +120 मिनट।",
  disclaimer: "यह स्थिति समझने का शोध प्रोटोटाइप है। यह भारत मौसम विज्ञान विभाग की चेतावनी नहीं है।",
  forecast: "पूर्वानुमान",
  scores: "अंक",
  strategy: "रणनीति",
  display: "डिस्प्ले कक्ष",
  lead: "लीड",
  play: "चलाएँ",
  pause: "रोकें",
  listen: "सुनें",
  listening: "सुन रहा है",
  english: "अंग्रेजी",
  hindi: "हिंदी",
  observed: "देखा गया",
  model: "मॉडल",
  flow: "ऑप्टिकल फ्लो",
  persistence: "स्थायित्व",
  infrared: "अवरक्त",
  lightning: "बिजली",
  lightningNote: "इस केस में बिजली की चमक का अवलोकन नहीं है। इस परत का अंक नहीं दिया जाता।",
  districts: "इस लीड पर जिले",
  chat: "पूछें",
  placeholder: "इस पूर्वानुमान के बारे में पूछें, या आदेश बोलें।",
  send: "भेजें",
  suggestions: [
    "अगले एक घंटे में तूफान कहाँ शुरू हो सकता है?",
    "60 मिनट पर CSI और ऑप्टिकल फ्लो",
    "रांची के पास किसानों को अगले एक घंटे में क्या करना चाहिए?",
  ],
  sources: "स्रोत",
  templateNote: "यह उत्तर तय टेम्पलेट है। भाषा मॉडल उपलब्ध नहीं था, या उसके मसौदे में ऐसा अंक या लिंक था जो पूर्वानुमान में नहीं है।",
  noSpeech: "इस ब्राउज़र में वाक् पहचान नहीं है। वही वाक्य लिखें।",
  emptyTitle: "हेल्ड आउट केस अभी इस मशीन पर नहीं है।",
  emptyBody: "पाइपलाइन चलाएँ। केस फाइल से पहले खिलाड़ी न तूफान दिखाएगा और न अंक।",
  joining: "डिस्प्ले कक्ष से जुड़ रहा है।",
  roomTitle: "फोन रिमोट",
  roomHelp: "फोन से यह कोड स्कैन करें। फोन के आदेश इस स्क्रीन को चलाते हैं। दूसरे नेटवर्क के फोन के लिए इस सर्वर का सार्वजनिक HTTPS पता चाहिए। लोकलहोस्ट केवल इस कंप्यूटर पर चलता है।",
  roomLocal: "कक्ष",
  noRoom: "डिस्प्ले कक्ष खोलें और उस स्क्रीन को चलाने के लिए कोड स्कैन करें।",
  sliceAll: "सभी सेल",
  sliceInit: "शुरुआत",
  sliceDecay: "क्षीण होना",
  testDay: "परीक्षण दोपहर",
  demoDay: "हेल्ड आउट दोपहर",
  threshold: "सीमा",
  noEvents: "इस हिस्से में कोई सेल नहीं।",
  hits: "सही / छूटे / गलत चेतावनी",
  buildIndex: "मार्गदर्शन सूची बनाएँ",
  building: "सार्वजनिक पृष्ठ पढ़े जा रहे हैं और एम्बेड हो रहे हैं।",
  indexMissing: "मार्गदर्शन सूची डिस्क पर नहीं है। पूर्वानुमान के अंक फिर भी पढ़े जा सकते हैं। कार्रवाई का पाठ नहीं गढ़ा जाएगा।",
  askStrategy: "इस लीड पर जिला अधिकारी को क्या करना चाहिए?",
  noCase: "केस फाइल डिस्क पर नहीं है, इसलिए कोई प्रायिकता उद्धृत नहीं की जा सकती।",
  footprint: "हर खंड इस क्षेत्र पर हिमावारी की एक पूर्ण डिस्क पिक्सेल है।",
};

export function copyOf(language: Lang): Copy {
  return language === "hi" ? hi : en;
}

export function commandAck(language: Lang, command: AppCommand): string {
  if (language === "hi") {
    if (command.op === "set_lead") return `लीड ${command.minutes} मिनट पर है।`;
    if (command.op === "play") return "लूप चल रहा है।";
    if (command.op === "pause") return "लूप रुका है।";
    if (command.op === "compare") return command.baseline === "persistence" ? "तुलना अब स्थायित्व से है।" : "तुलना अब ऑप्टिकल फ्लो से है।";
    if (command.op === "toggle_layer" && command.layer === "lightning") return "बिजली की परत खुली है। इस केस में बिजली के अवलोकन नहीं हैं।";
    if (command.op === "zoom_district") return "जिला नक्शे पर खुला है।";
    if (command.op === "set_language") return command.code === "hi" ? "भाषा हिंदी है।" : "भाषा अंग्रेजी है।";
    return "आदेश लागू हो गया।";
  }
  if (command.op === "set_lead") return `Lead is ${command.minutes} minutes.`;
  if (command.op === "play") return "The loop is playing.";
  if (command.op === "pause") return "The loop is paused.";
  if (command.op === "compare") return command.baseline === "persistence" ? "The comparison is persistence." : "The comparison is optical flow.";
  if (command.op === "toggle_layer" && command.layer === "lightning") return "The lightning layer is open. This case has no flash observations.";
  if (command.op === "zoom_district") return "The district is on the map.";
  if (command.op === "set_language") return command.code === "hi" ? "The language is Hindi." : "The language is English.";
  return "The command is applied.";
}
