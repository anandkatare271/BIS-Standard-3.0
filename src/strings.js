/**
 * UI strings, English and Hindi.
 *
 * Kept out of App.jsx because there are enough of them to bury the components.
 * Every key must exist in both objects — tests/strings.test.js asserts that, so
 * a missing translation fails the build rather than silently rendering English
 * inside an otherwise Hindi page.
 *
 * Hindi here is the register used in Indian government procurement documents
 * (निविदा, अनुपालन, विनिर्देश) rather than colloquial Hindi.
 */

export const STR = {
  en: {
    /* shell */
    appName: "IS-Match AI",
    appSubtitle: "Standards Recommendation Engine",
    tagline: "Describe What You Procure. AI Finds What Standards Apply.",
    home: "Home",
    viewingAs: "Viewing as",
    roleOfficer: "Procurement Officer",
    roleExpert: "Technical Expert",
    roleAdmin: "Administrator",
    catalogLive: "Live SQLite catalog",
    catalogLocal: "Local demo catalog",
    catalogDisclaimer: "illustrative sample data, not verified against live BIS records",
    standardDetail: "Standard Detail",

    nav: {
      dashboard: "Dashboard", analyzer: "Specification Analyzer", tender: "Tender Upload & Analyzer",
      search: "Search Standards", recommendations: "Recommended Standards", allied: "Allied & Normative",
      graph: "Knowledge Graph", version: "Version & Amendment", certification: "Certification Checker",
      compliance: "Compliance & Risk Score", specification: "Generate Specification",
      expert: "Expert Review", adminDb: "Standards Database",
    },

    /* common */
    analyze: "Analyze",
    analyzing: "Analyzing",
    loadExample: "Try an example",
    viewRecs: "View recommended standards",
    back: "Back",
    standard: "Standard",
    status: "Status",
    category: "Category",
    title: "Title",
    number: "Number",
    year: "Year",
    edition: "Edition",
    amendments: "Amendments",
    latestVersion: "Latest available version",
    scope: "Scope",
    reason: "Reason",
    action: "Action",
    recommendedAction: "Recommended action",
    scheme: "Scheme",
    decision: "Decision",
    actions: "Actions",
    relevance: "Relevance",
    pending: "Pending",
    saved: "Saved",
    decisions: "Decisions",
    reopen: "Reopen",
    viewDetails: "View details",
    legend: "Legend",

    /* analyzer */
    analyzerTitle: "Specification Analyzer",
    analyzerLead: "Describe what you need to procure in plain language — English, Hindi, or Hinglish.",
    analyzerPlaceholder: "e.g. We need to procure 200 solar-powered LED street lights for rural roads, weather resistant with electrical safety.",
    detectedLanguage: "Detected language",
    extractedRequirements: "Extracted requirements",

    /* tender */
    tenderTitle: "Tender Upload & Analyzer",
    tenderLead: "Upload or paste tender specification text to audit it for missing, outdated or conflicting standards references.",
    tenderPlaceholder: "Paste tender or specification text here, or upload a PDF, DOCX or TXT file above…",
    loadSampleClause: "Load sample tender clause",
    uploadFile: "Upload PDF/DOCX/TXT",
    extractingFrom: "Extracting text from",
    analyzeTender: "Analyze tender",
    missingStandards: "Missing standards",
    outdatedReferences: "Outdated references",
    conflictsDetected: "Conflicts detected",
    conflictsBody: "No direct scope conflicts were detected between the matched standards in this pass. Standards with overlapping scope are shown together in",
    forExpertReview: "for expert review.",

    /* tender audit */
    auditVerdict: "Tender audit",
    auditCited: "Cited",
    auditRecognised: "Recognised",
    auditOmitted: "Not cited",
    auditConflicts: "Conflicts",
    auditCitedPanel: "Standards cited in this tender",
    auditNoCitations: "This tender cites no Indian Standard. A tender that names no standard cannot be evaluated against one, and bidders are free to supply any quality.",
    auditOmittedPanel: "Applicable but not cited",
    auditNothingOmitted: "Every applicable standard identified is already cited in the tender.",
    auditSupporting: "Supporting standards also worth citing:",
    auditNoConflicts: "No overlapping or contradictory standards were found among the matches.",
    viewFullCompliance: "View full compliance score →",

    /* search */
    searchTitle: "Search Standards",
    searchLead: "Browse the full sample dataset by standard number, title, category or keyword.",
    searchPlaceholder: "Search e.g. 'LED', 'fire door', 'water tank', 'IS 1520'…",
    searchEmpty: "No standards matched your search.",

    /* recommendations */
    recsTitle: "Recommendation Results",
    product: "Product",
    analyzedAt: "Analyzed",
    queryLanguage: "Query language",
    aiSummary: "AI summary",
    aiSummaryNote: "Standards below were selected by the matching engine, not by the model. The model explained the selection.",
    whyRecommended: "Why recommended?",
    accept: "Accept",
    reject: "Reject",
    notApplicable: "Not applicable",
    sendToExpert: "Send to expert review",
    viewAllied: "View allied & normative view →",
    openGraph: "Open knowledge graph →",
    viewComplianceScore: "View compliance & risk score →",

    /* detail */
    certificationStatus: "Certification status",
    certificationIntelligence: "Certification intelligence",

    /* allied */
    alliedTitle: "Allied & Normative Standards",
    alliedLead: "Standards tiered by relationship strength to the primary recommendation for",
    potentialStandards: "Potential / contextual standards",
    potentialLead: "May Be Applicable — flagged as potentially missing from the current query and worth expert review:",

    /* graph */
    graphTitle: "Standards Relationship Graph",
    graphLead: "Click any satellite node to inspect that standard, or change the focus below.",
    focusedStandard: "Focused standard",
    openFullDetail: "Open full detail →",

    /* version */
    versionTitle: "Version & Amendment Checker",
    versionLead: "Verify whether a standard is current, revised, superseded, withdrawn or under revision.",
    standardsInAnalysis: "Standards in current analysis",
    outdatedDetected: "Outdated reference detected —",
    manualLookup: "Manual lookup",

    /* certification */
    certTitle: "Certification Checker",
    certLead: "Distinguishes Indian Standard applicability from legally mandatory certification. Guidance is a prompt to verify, not a compliance determination.",
    manualCategoryLookup: "Manual category lookup",
    certEmpty: "No certification-relevant standards identified for this category in the sample dataset.",

    /* compliance */
    complianceTitle: "Tender Standards Compliance Score",
    overallScore: "Overall Compliance Score",
    overallRisk: "Overall Procurement Risk",
    complianceDna: "Compliance DNA",
    subMetrics: "Sub-metric breakdown",
    potentialMissing: "Potential missing requirements",
    howCalculated: "How this score is calculated",
    howCalculatedBody: "Computed from the matched standards themselves: version currency (the share still marked Current), normative coverage (how many of their own cross-references were also matched), tier breadth, safety coverage, certification coverage and average match strength. Weighted 22% coverage, 22% technical completeness, 16% normative references, 14% version validity, 14% safety coverage and 12% certification coverage.",
    howCalculatedCaveat: "Decision support only. This is not a compliance determination and does not replace verification against current BIS notifications and Quality Control Orders.",

    /* specification */
    specTitle: "Generate Standards-Aware Tender Specification",
    copyToClipboard: "Copy to clipboard",
    copied: "Copied",
    addToTender: "Add to tender",

    /* expert */
    expertTitle: "Technical Expert Console",
    expertLead: "This is a decision-support tool, not the final authority. Review, accept, reject or escalate each recommendation.",
    recommendationQueue: "Recommendation queue",
    auditTrail: "Audit trail",
    auditEmpty: "No actions recorded yet.",

    /* admin */
    adminTitle: "Standards Database — Administrator View",
    adminLeadA: "standards loaded from SQLite across",
    adminLeadB: "categories. Status edits are saved to the database.",

    /* busy + toasts */
    busyTitle: "Analyzing",
    stageReading: "Reading the requirement…",
    stageExtracting: "Extracting product, material and quantity…",
    stageMatching: "Matching against the standards catalog…",
    stageExplaining: "Writing the reasoning for each standard…",
    stageStillWorking: "Still working — finishing up…",
    dismiss: "Dismiss",

    /* dashboard */
    currentSession: "Current session",
    detectedProduct: "Detected product",
    recommendationsLabel: "Recommendations",
    viewFullRecs: "View full recommendation set →",
    recentActivity: "Recent activity",
    noActivity: "No actions logged yet in this session.",
    savedAnalyses: "Saved analyses",
    language: "Language",
    prototypeBuild: "Prototype build · SIH 2026",
    dashboardLead: "Explainable, standards-aware recommendations for government departments, PSUs and public bodies.",
  },

  hi: {
    /* shell */
    appName: "IS-Match AI",
    appSubtitle: "मानक अनुशंसा प्रणाली",
    tagline: "आप जो खरीदना चाहते हैं उसका वर्णन करें। AI बताएगा कौन-से मानक लागू होते हैं।",
    home: "मुख्य पृष्ठ",
    viewingAs: "भूमिका",
    roleOfficer: "क्रय अधिकारी",
    roleExpert: "तकनीकी विशेषज्ञ",
    roleAdmin: "प्रशासक",
    catalogLive: "लाइव SQLite सूची",
    catalogLocal: "स्थानीय डेमो सूची",
    catalogDisclaimer: "उदाहरणात्मक नमूना डेटा, वास्तविक BIS अभिलेखों से सत्यापित नहीं",
    standardDetail: "मानक विवरण",

    nav: {
      dashboard: "डैशबोर्ड", analyzer: "विनिर्देश विश्लेषक", tender: "निविदा अपलोड व विश्लेषण",
      search: "मानक खोजें", recommendations: "अनुशंसित मानक", allied: "संबद्ध व मानक-संदर्भ",
      graph: "ज्ञान ग्राफ", version: "संस्करण व संशोधन", certification: "प्रमाणन जाँच",
      compliance: "अनुपालन व जोखिम स्कोर", specification: "विनिर्देश तैयार करें",
      expert: "विशेषज्ञ समीक्षा", adminDb: "मानक डेटाबेस",
    },

    /* common */
    analyze: "विश्लेषण करें",
    analyzing: "विश्लेषण हो रहा है",
    loadExample: "उदाहरण आज़माएँ",
    viewRecs: "अनुशंसित मानक देखें",
    back: "वापस",
    standard: "मानक",
    status: "स्थिति",
    category: "श्रेणी",
    title: "शीर्षक",
    number: "संख्या",
    year: "वर्ष",
    edition: "संस्करण",
    amendments: "संशोधन",
    latestVersion: "नवीनतम उपलब्ध संस्करण",
    scope: "कार्यक्षेत्र",
    reason: "कारण",
    action: "कार्रवाई",
    recommendedAction: "अनुशंसित कार्रवाई",
    scheme: "योजना",
    decision: "निर्णय",
    actions: "कार्रवाइयाँ",
    relevance: "प्रासंगिकता",
    pending: "लंबित",
    saved: "सहेजा गया",
    decisions: "निर्णय",
    reopen: "पुनः खोलें",
    viewDetails: "विवरण देखें",
    legend: "संकेत-सूची",

    /* analyzer */
    analyzerTitle: "विनिर्देश विश्लेषक",
    analyzerLead: "आप जो खरीदना चाहते हैं उसका सामान्य भाषा में वर्णन करें — अंग्रेज़ी, हिंदी या हिंग्लिश में।",
    analyzerPlaceholder: "उदाहरण: ग्रामीण सड़कों के लिए 200 सोलर LED स्ट्रीट लाइट खरीदनी हैं, मौसम-प्रतिरोधी और विद्युत सुरक्षा सहित।",
    detectedLanguage: "पहचानी गई भाषा",
    extractedRequirements: "निकाली गई आवश्यकताएँ",

    /* tender */
    tenderTitle: "निविदा अपलोड व विश्लेषण",
    tenderLead: "निविदा विनिर्देश अपलोड करें या यहाँ चिपकाएँ, जिससे अनुपस्थित, पुराने या परस्पर विरोधी मानक-संदर्भों की जाँच हो सके।",
    tenderPlaceholder: "निविदा या विनिर्देश का पाठ यहाँ चिपकाएँ, अथवा ऊपर से PDF, DOCX या TXT फ़ाइल अपलोड करें…",
    loadSampleClause: "नमूना निविदा खंड लोड करें",
    uploadFile: "PDF/DOCX/TXT अपलोड करें",
    extractingFrom: "पाठ निकाला जा रहा है:",
    analyzeTender: "निविदा का विश्लेषण करें",
    missingStandards: "अनुपस्थित मानक",
    outdatedReferences: "पुराने संदर्भ",
    conflictsDetected: "पाए गए विरोध",
    conflictsBody: "इस चरण में मिले मानकों के बीच कार्यक्षेत्र का कोई सीधा विरोध नहीं पाया गया। समान कार्यक्षेत्र वाले मानक एक साथ यहाँ दिखाए गए हैं:",
    forExpertReview: "— विशेषज्ञ समीक्षा हेतु।",

    /* tender audit */
    auditVerdict: "निविदा अंकेक्षण",
    auditCited: "उद्धृत",
    auditRecognised: "पहचाने गए",
    auditOmitted: "उद्धृत नहीं",
    auditConflicts: "विरोध",
    auditCitedPanel: "इस निविदा में उद्धृत मानक",
    auditNoCitations: "इस निविदा में किसी भारतीय मानक का उल्लेख नहीं है। जो निविदा किसी मानक का नाम नहीं लेती, उसका मूल्यांकन किसी मानक के आधार पर नहीं हो सकता और बोलीदाता कोई भी गुणवत्ता दे सकते हैं।",
    auditOmittedPanel: "लागू, परंतु उद्धृत नहीं",
    auditNothingOmitted: "पहचाने गए सभी लागू मानक निविदा में पहले से उद्धृत हैं।",
    auditSupporting: "सहायक मानक जिन्हें उद्धृत करना उचित है:",
    auditNoConflicts: "मिले हुए मानकों में कोई अतिव्यापी या परस्पर विरोधी मानक नहीं पाया गया।",
    viewFullCompliance: "पूर्ण अनुपालन स्कोर देखें →",

    /* search */
    searchTitle: "मानक खोजें",
    searchLead: "पूरे नमूना डेटासेट को मानक संख्या, शीर्षक, श्रेणी या कीवर्ड से देखें।",
    searchPlaceholder: "खोजें, जैसे 'LED', 'fire door', 'water tank', 'IS 1520'…",
    searchEmpty: "आपकी खोज से कोई मानक मेल नहीं खाया।",

    /* recommendations */
    recsTitle: "अनुशंसा परिणाम",
    product: "उत्पाद",
    analyzedAt: "विश्लेषण किया गया",
    queryLanguage: "प्रश्न की भाषा",
    aiSummary: "AI सारांश",
    aiSummaryNote: "नीचे दिए मानक मिलान इंजन द्वारा चुने गए हैं, मॉडल द्वारा नहीं। मॉडल ने केवल चयन की व्याख्या की है।",
    whyRecommended: "अनुशंसा का आधार?",
    accept: "स्वीकार करें",
    reject: "अस्वीकार करें",
    notApplicable: "लागू नहीं",
    sendToExpert: "विशेषज्ञ समीक्षा को भेजें",
    viewAllied: "संबद्ध व मानक-संदर्भ देखें →",
    openGraph: "ज्ञान ग्राफ खोलें →",
    viewComplianceScore: "अनुपालन व जोखिम स्कोर देखें →",

    /* detail */
    certificationStatus: "प्रमाणन स्थिति",
    certificationIntelligence: "प्रमाणन जानकारी",

    /* allied */
    alliedTitle: "संबद्ध व मानक-संदर्भ",
    alliedLead: "प्राथमिक अनुशंसा से संबंध की प्रबलता के अनुसार श्रेणीबद्ध मानक, इसके लिए:",
    potentialStandards: "संभावित / प्रासंगिक मानक",
    potentialLead: "लागू हो सकते हैं — वर्तमान प्रश्न में संभवतः अनुपस्थित और विशेषज्ञ समीक्षा योग्य:",

    /* graph */
    graphTitle: "मानक संबंध ग्राफ",
    graphLead: "किसी भी सहायक नोड पर क्लिक करके वह मानक देखें, या नीचे से केंद्र बदलें।",
    focusedStandard: "केंद्रित मानक",
    openFullDetail: "पूर्ण विवरण खोलें →",

    /* version */
    versionTitle: "संस्करण व संशोधन जाँच",
    versionLead: "जाँचें कि कोई मानक वर्तमान, संशोधित, अधिक्रमित, वापस लिया गया या पुनरीक्षणाधीन है।",
    standardsInAnalysis: "वर्तमान विश्लेषण के मानक",
    outdatedDetected: "पुराना संदर्भ पाया गया —",
    manualLookup: "स्वयं खोजें",

    /* certification */
    certTitle: "प्रमाणन जाँच",
    certLead: "भारतीय मानक की प्रयोज्यता और विधिक रूप से अनिवार्य प्रमाणन में अंतर स्पष्ट करता है। यह मार्गदर्शन सत्यापन का संकेत है, अनुपालन का निर्धारण नहीं।",
    manualCategoryLookup: "श्रेणी के अनुसार स्वयं खोजें",
    certEmpty: "नमूना डेटासेट में इस श्रेणी हेतु प्रमाणन-संबंधी कोई मानक चिन्हित नहीं हुआ।",

    /* compliance */
    complianceTitle: "निविदा मानक अनुपालन स्कोर",
    overallScore: "समग्र अनुपालन स्कोर",
    overallRisk: "समग्र क्रय जोखिम",
    complianceDna: "अनुपालन प्रोफ़ाइल",
    subMetrics: "उप-मानक विवरण",
    potentialMissing: "संभावित अनुपस्थित आवश्यकताएँ",
    howCalculated: "यह स्कोर कैसे निकाला गया",
    howCalculatedBody: "यह मिले हुए मानकों से ही गणना किया जाता है: संस्करण वर्तमानता (कितने अब भी 'Current' हैं), मानक-संदर्भ कवरेज (उनके स्वयं के संदर्भों में से कितने भी मिले), श्रेणी-विस्तार, सुरक्षा कवरेज, प्रमाणन कवरेज और औसत मिलान प्रबलता। भार: कवरेज 22%, तकनीकी पूर्णता 22%, मानक-संदर्भ 16%, संस्करण वैधता 14%, सुरक्षा कवरेज 14% और प्रमाणन कवरेज 12%।",
    howCalculatedCaveat: "केवल निर्णय-सहायता। यह अनुपालन का निर्धारण नहीं है और वर्तमान BIS अधिसूचनाओं तथा गुणवत्ता नियंत्रण आदेशों से सत्यापन का विकल्प नहीं है।",

    /* specification */
    specTitle: "मानक-आधारित निविदा विनिर्देश तैयार करें",
    copyToClipboard: "क्लिपबोर्ड पर कॉपी करें",
    copied: "कॉपी हो गया",
    addToTender: "निविदा में जोड़ें",

    /* expert */
    expertTitle: "तकनीकी विशेषज्ञ कंसोल",
    expertLead: "यह निर्णय-सहायता उपकरण है, अंतिम प्राधिकारी नहीं। प्रत्येक अनुशंसा की समीक्षा करें — स्वीकार, अस्वीकार या आगे भेजें।",
    recommendationQueue: "अनुशंसा सूची",
    auditTrail: "अंकेक्षण अभिलेख",
    auditEmpty: "अभी कोई कार्रवाई दर्ज नहीं हुई।",

    /* admin */
    adminTitle: "मानक डेटाबेस — प्रशासक दृश्य",
    adminLeadA: "मानक SQLite से लोड हुए,",
    adminLeadB: "श्रेणियों में। स्थिति में किए बदलाव डेटाबेस में सहेजे जाते हैं।",

    /* busy + toasts */
    busyTitle: "विश्लेषण हो रहा है",
    stageReading: "आवश्यकता पढ़ी जा रही है…",
    stageExtracting: "उत्पाद, सामग्री और मात्रा निकाली जा रही है…",
    stageMatching: "मानक सूची से मिलान किया जा रहा है…",
    stageExplaining: "प्रत्येक मानक का कारण लिखा जा रहा है…",
    stageStillWorking: "कार्य जारी है — पूरा हो रहा है…",
    dismiss: "बंद करें",

    /* dashboard */
    currentSession: "वर्तमान सत्र",
    detectedProduct: "पहचाना गया उत्पाद",
    recommendationsLabel: "अनुशंसाएँ",
    viewFullRecs: "पूरी अनुशंसा सूची देखें →",
    recentActivity: "हाल की गतिविधि",
    noActivity: "इस सत्र में अभी कोई कार्रवाई दर्ज नहीं हुई।",
    savedAnalyses: "सहेजे गए विश्लेषण",
    language: "भाषा",
    prototypeBuild: "प्रोटोटाइप बिल्ड · SIH 2026",
    dashboardLead: "सरकारी विभागों, सार्वजनिक उपक्रमों और निकायों के लिए व्याख्यायोग्य, मानक-आधारित अनुशंसाएँ।",
  },
};
