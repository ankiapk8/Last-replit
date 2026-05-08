// ── Shared mock data for all 5 medical UI components ──

// ═══════════════════════════════════════════════════════════
// Component A: Clinical Article Card — Acute Myocardial Infarction
// ═══════════════════════════════════════════════════════════

export interface SubSection {
  heading: string;
  content: string;
}

export interface HighlightBox {
  type: "high-yield" | "exam-pearl" | "warning" | "emergency" | "pitfall";
  content: string;
}

export interface ClinicalSection {
  id: string;
  title: string;
  icon: string;
  badge?: string;
  color: string; // tailwind border/bg color name
  subsections: SubSection[];
  highlights: HighlightBox[];
}

export interface ClinicalArticleData {
  title: string;
  specialty: string;
  severity: "low" | "moderate" | "high" | "critical";
  severityLabel: string;
  readingTimeMinutes: number;
  lastUpdated: string;
  sections: ClinicalSection[];
}

export const clinicalArticleData: ClinicalArticleData = {
  title: "Acute Myocardial Infarction",
  specialty: "Cardiology",
  severity: "critical",
  severityLabel: "Critical",
  readingTimeMinutes: 25,
  lastUpdated: "2025-12-01",
  sections: [
    {
      id: "overview",
      title: "Overview",
      icon: "📋",
      badge: "Foundation",
      color: "blue",
      subsections: [
        {
          heading: "Definition",
          content:
            "Acute myocardial infarction (AMI) refers to the death of myocardial tissue due to prolonged ischemia, typically resulting from abrupt reduction of coronary blood flow to a segment of the myocardium.",
        },
        {
          heading: "Core Concept",
          content:
            "AMI occurs when atherosclerotic plaque rupture or erosion triggers thrombus formation in a coronary artery, leading to complete or near-complete occlusion. The resulting ischemia causes myocardial cell death if blood flow is not restored promptly.",
        },
        {
          heading: "High-Yield Summary",
          content:
            "STEMI = ST elevation + troponin rise → emergent PCI within 90 min. NSTEMI = ST depression/T-wave inversion + troponin rise → risk-stratify, PCI within 24-72h. Time is muscle — every 30 min delay increases 1-year mortality by 7.5%.",
        },
        {
          heading: "Epidemiology",
          content:
            "Leading cause of death worldwide. ~800,000 AMIs per year in the US. Incidence increases with age, male sex, and cardiovascular risk factors. Mortality has declined significantly with modern reperfusion strategies.",
        },
        {
          heading: "Incidence & Prevalence",
          content:
            "Annual incidence: ~600 per 100,000 in men, ~200 per 100,000 in women. Peak age: 55-65 years. Prevalence of coronary artery disease in adults >20 years: ~7%.",
        },
        {
          heading: "Age Distribution",
          content:
            "Rare before age 40 (unless familial hypercholesterolemia, cocaine use, or coronary anomaly). Incidence rises sharply after 45 in men and 55 in women. Women present on average 10 years later than men.",
        },
        {
          heading: "Risk Groups",
          content:
            "Highest risk: diabetics, smokers, hypertensives, those with family history of premature CAD, chronic kidney disease, and patients with known peripheral arterial disease.",
        },
      ],
      highlights: [
        {
          type: "high-yield",
          content:
            "STEMI: ST elevation in ≥2 contiguous leads. NSTEMI: ST changes + elevated troponin without ST elevation.",
        },
        {
          type: "exam-pearl",
          content:
            "The 'golden hour' — PCI within 90 minutes of first medical contact is the single most important prognostic factor in STEMI.",
        },
      ],
    },
    {
      id: "etiology",
      title: "Etiology",
      icon: "🔀",
      badge: "Causes",
      color: "amber",
      subsections: [
        {
          heading: "Atherosclerotic (Most Common)",
          content:
            "Plaque rupture (60-70%) or plaque erosion (30%) of a coronary atherosclerotic lesion → acute thrombus formation → vessel occlusion.",
        },
        {
          heading: "Non-Atherosclerotic Causes",
          content:
            "Coronary artery spasm (Prinzmetal angina), coronary embolism (atrial fibrillation, endocarditis), coronary artery dissection (spontaneous — SCAD), coronary vasculitis (Kawasaki, SLE), cocaine/amphetamine use causing vasospasm.",
        },
        {
          heading: "Supply-Demand Mismatch (Type 2 MI)",
          content:
            "Tachyarrhythmia, severe anemia, hypotension, respiratory failure, severe hypertension — any condition causing prolonged imbalance between oxygen supply and demand.",
        },
        {
          heading: "Risk Factors",
          content:
            "Modifiable: smoking, hypertension, diabetes, dyslipidemia, obesity, sedentary lifestyle. Non-modifiable: age, male sex, family history of premature CAD.",
        },
      ],
      highlights: [
        {
          type: "warning",
          content:
            "Type 2 MI (supply-demand mismatch) does NOT benefit from antiplatelet therapy or PCI — treat the underlying cause.",
        },
        {
          type: "pitfall",
          content:
            "Young patients with MI: always consider cocaine use, coronary artery anomaly, SCAD, or hypercoagulable state.",
        },
      ],
    },
    {
      id: "pathophysiology",
      title: "Pathophysiology",
      icon: "🔬",
      badge: "Mechanisms",
      color: "rose",
      subsections: [
        {
          heading: "Normal Physiology",
          content:
            "The myocardium requires continuous oxygen supply via coronary arteries. Oxygen extraction is already near-maximal at rest (~75%), so increased demand must be met by increased flow.",
        },
        {
          heading: "Molecular Basis",
          content:
            "Plaque rupture exposes collagen and tissue factor → platelet adhesion, activation, and aggregation → thrombin generation → fibrin mesh → occlusive thrombus. Vulnerable plaques have thin fibrous caps, large lipid cores, and macrophage infiltration.",
        },
        {
          heading: "Cellular Mechanisms",
          content:
            "Within 20-40 minutes of ischemia: ATP depletion → Na+/K+ pump failure → cellular swelling. Irreversible cell death begins at ~20 min in subendocardium. Wavefront of necrosis spreads from subendocardium to epicardium.",
        },
        {
          heading: "Disease Progression Timeline",
          content:
            "0-20 min: reversible ischemia. 20-40 min: irreversible injury begins (subendocardial). 4-12 h: coagulative necrosis. 12-24 h: neutrophil infiltration. 1-3 days: macrophage infiltration. 1-2 weeks: granulation tissue. 2-8 weeks: scar formation.",
        },
        {
          heading: "Clinical Consequence Mapping",
          content:
            "Anterior wall (LAD) → LV dysfunction, heart failure, cardiogenic shock. Inferior wall (RCA) → bradycardia, AV block, RV infarction. Lateral wall (LCx) → mitral regurgitation (papillary muscle dysfunction).",
        },
      ],
      highlights: [
        {
          type: "high-yield",
          content:
            "Wavefront phenomenon: necrosis spreads from subendocardium → epicardium. Early reperfusion can save the epicardial rim.",
        },
        {
          type: "exam-pearl",
          content:
            "Reperfusion injury: restoring flow can cause oxidative stress, calcium overload, and arrhythmias — this is why PCI timing matters.",
        },
      ],
    },
    {
      id: "clinical-features",
      title: "Clinical Features",
      icon: "🏥",
      badge: "Presentation",
      color: "emerald",
      subsections: [
        {
          heading: "Early Symptoms",
          content:
            "Chest pain: substernal, crushing/pressure-like, radiating to left arm, jaw, or back. Associated diaphoresis, nausea, dyspnea. Pain at rest, lasting >20 minutes, not relieved by nitroglycerin.",
        },
        {
          heading: "Atypical Presentations",
          content:
            "More common in women, elderly, diabetics: dyspnea alone, fatigue, epigastric pain, syncope, confusion. Up to 30% of MIs are 'silent' (especially diabetics with autonomic neuropathy).",
        },
        {
          heading: "Physical Examination",
          content:
            "Diaphoresis, tachycardia or bradycardia, S4 gallop (stiff ventricle), new mitral regurgitation murmur (papillary muscle dysfunction), crackles (pulmonary edema), hypotension (cardiogenic shock).",
        },
        {
          heading: "Red Flags",
          content:
            "Hemodynamic instability, new heart failure, sustained VT/VF, recurrent ischemia, mechanical complications (VSD, free wall rupture, papillary muscle rupture).",
        },
        {
          heading: "Emergency Presentations",
          content:
            "Cardiogenic shock (SBP <90, oliguria, altered mental status), cardiac arrest (VF/pulseless VT), acute pulmonary edema, complete heart block with inferior MI.",
        },
      ],
      highlights: [
        {
          type: "emergency",
          content:
            "Cardiogenic shock in AMI has >40% mortality. Emergent PCI or CABG is indicated. Consider mechanical circulatory support (IABP, Impella).",
        },
        {
          type: "warning",
          content:
            "Inferior MI + hypotension + clear lungs → think RV infarction. Check right-sided leads (V4R). Avoid nitrates and give IV fluids.",
        },
      ],
    },
    {
      id: "differential-diagnosis",
      title: "Differential Diagnosis",
      icon: "🔍",
      badge: "DDx",
      color: "sky",
      subsections: [
        {
          heading: "Similar Conditions",
          content:
            "Aortic dissection (tearing pain, pulse deficit, widened mediastinum), pulmonary embolism (pleuritic pain, dyspnea, tachycardia, positive D-dimer), pericarditis (diffuse ST elevation, PR depression, pleuritic positional pain), esophageal spasm/rupture, musculoskeletal pain, panic attack.",
        },
        {
          heading: "Distinguishing Findings",
          content:
            "Aortic dissection: tearing pain radiating to back, blood pressure differential between arms. PE: pleuritic pain, hypoxia, positive CTA. Pericarditis: diffuse ST elevation with PR depression, improves sitting forward.",
        },
        {
          heading: "Common Pitfalls",
          content:
            "Missing aortic dissection by giving anticoagulation. Attributing chest pain to GERD in a diabetic elderly patient. Dismissing dyspnea-only presentation in women as anxiety.",
        },
      ],
      highlights: [
        {
          type: "pitfall",
          content:
            "NEVER give anticoagulation until aortic dissection is ruled out in patients with tearing chest pain and blood pressure differential.",
        },
      ],
    },
    {
      id: "diagnostics",
      title: "Diagnostics",
      icon: "🧪",
      badge: "Workup",
      color: "sky",
      subsections: [
        {
          heading: "ECG (First-Line)",
          content:
            "Obtain within 10 minutes of arrival. STEMI: ST elevation ≥1mm in ≥2 contiguous leads (≥2mm in V1-V3). New LBBB with clinical suspicion. Reciprocal ST depression. Pathological Q waves (late sign).",
        },
        {
          heading: "Cardiac Biomarkers",
          content:
            "High-sensitivity troponin: rise and fall pattern with at least one value >99th percentile. CK-MB useful for detecting reinfarction. Troponin rises at 3-4h, peaks at 12-24h, normalizes in 5-10 days.",
        },
        {
          heading: "Imaging",
          content:
            "Echocardiogram: regional wall motion abnormalities, LVEF estimation, mechanical complications. Coronary angiography: gold standard for diagnosis and treatment. CT angiography for low-risk patients with equivocal findings.",
        },
        {
          heading: "Diagnostic Criteria",
          content:
            "Fourth Universal Definition: rise and/or fall of troponin with at least one value >99th percentile + at least one of: symptoms of ischemia, new ischemic ECG changes, pathological Q waves, imaging evidence of new loss of viable myocardium, or identification of coronary thrombus.",
        },
        {
          heading: "Gold Standard",
          content:
            "Coronary angiography with troponin elevation. Directly visualizes the occluded vessel and allows simultaneous intervention (PCI).",
        },
      ],
      highlights: [
        {
          type: "high-yield",
          content:
            "STEMI criteria: ST elevation ≥1mm in ≥2 contiguous limb leads, ≥2mm in precordial leads, or new LBBB with clinical suspicion.",
        },
        {
          type: "exam-pearl",
          content:
            "Posterior MI: ST depression in V1-V3 with tall R waves — obtain posterior leads (V7-V9). Right-sided MI: ST elevation in V4R.",
        },
      ],
    },
    {
      id: "classification",
      title: "Classification and Severity",
      icon: "📊",
      badge: "Staging",
      color: "violet",
      subsections: [
        {
          heading: "STEMI vs NSTEMI",
          content:
            "STEMI: complete coronary occlusion, ST elevation, requires emergent reperfusion. NSTEMI: partial occlusion or microembolization, ST depression/T-wave inversion, risk-stratify for timing of PCI.",
        },
        {
          heading: "Killip Classification",
          content:
            "Class I: no heart failure (mortality 6%). Class II: mild HF, S3, rales <50% lung fields (mortality 17%). Class III: pulmonary edema (mortality 38%). Class IV: cardiogenic shock (mortality 81%).",
        },
        {
          heading: "TIMI Risk Score (NSTEMI)",
          content:
            "7 variables (1 point each): age ≥65, ≥3 CAD risk factors, known CAD, aspirin use in past 7d, recent severe angina, ST deviation, elevated markers. Score ≥3 = high risk → early invasive strategy.",
        },
        {
          heading: "Prognostic Indicators",
          content:
            "LVEF <40%, anterior location, multivessel disease, cardiogenic shock, age >75, renal insufficiency, delayed reperfusion.",
        },
      ],
      highlights: [
        {
          type: "high-yield",
          content:
            "Killip Class IV (cardiogenic shock) has >80% mortality without revascularization. Emergent PCI improves survival significantly.",
        },
      ],
    },
    {
      id: "management",
      title: "Management",
      icon: "💊",
      badge: "Treatment",
      color: "teal",
      subsections: [
        {
          heading: "Initial Stabilization (MONA)",
          content:
            "Morphine (pain relief, reduces preload), Oxygen (only if SpO2 <90%), Nitroglycerin (sublingual/IV — avoid in RV infarction, hypotension, PDE5 inhibitor use), Aspirin 325 mg chewed.",
        },
        {
          heading: "STEMI Reperfusion",
          content:
            "Primary PCI: preferred if available within 120 min of first medical contact (door-to-balloon <90 min). Thrombolysis: if PCI not available within 120 min, give within 30 min of arrival (door-to-needle <30 min). Tenecteplase or alteplase.",
        },
        {
          heading: "NSTEMI Management",
          content:
            "Dual antiplatelet therapy (aspirin + ticagrelor/prasugrel). Anticoagulation (heparin/enoxaparin). Risk-stratify: high-risk → early invasive (<24h), low-risk → ischemia-guided strategy. GP IIb/IIIa inhibitors for high thrombus burden.",
        },
        {
          heading: "Pharmacologic Therapy",
          content:
            "Dual antiplatelet therapy (DAPT): aspirin + P2Y12 inhibitor for 12 months. High-intensity statin (atorvastatin 80 mg or rosuvastatin 40 mg). Beta-blocker (if no contraindications). ACE inhibitor (if LVEF <40% or anterior MI). Aldosterone antagonist (if LVEF <40% + HF symptoms).",
        },
        {
          heading: "ICU Indications",
          content:
            "Cardiogenic shock, hemodynamic instability, sustained VT/VF, acute heart failure requiring inotropes, mechanical complications, complete heart block requiring pacing.",
        },
        {
          heading: "Escalation Pathway",
          content:
            "Medical therapy → PCI if refractory ischemia → CABG if left main or multivessel disease not amenable to PCI → mechanical circulatory support (IABP, Impella, ECMO) if cardiogenic shock refractory to medical therapy.",
        },
      ],
      highlights: [
        {
          type: "emergency",
          content:
            "STEMI: door-to-balloon time <90 minutes. Every 30-minute delay increases 1-year mortality by 7.5%. Activate cath lab immediately.",
        },
        {
          type: "warning",
          content:
            "Avoid nitrates in RV infarction (causes severe hypotension) and in patients who have taken PDE5 inhibitors within 24-48 hours.",
        },
        {
          type: "high-yield",
          content:
            "DAPT duration: minimum 12 months after ACS. Aspirin lifelong. P2Y12 inhibitor choice: ticagrelor or prasugrel preferred over clopidogrel (unless contraindicated).",
        },
      ],
    },
    {
      id: "medication-details",
      title: "Medication Details",
      icon: "💉",
      badge: "Drugs",
      color: "indigo",
      subsections: [
        {
          heading: "Aspirin",
          content:
            "Mechanism: irreversible COX-1 inhibition → blocks thromboxane A2 → inhibits platelet aggregation. Dose: 325 mg chewed acutely, then 81 mg daily. Contraindications: active bleeding, severe allergy. Monitoring: watch for GI bleeding.",
        },
        {
          heading: "Ticagrelor",
          content:
            "Mechanism: reversible P2Y12 ADP receptor antagonist. Dose: 180 mg load, then 90 mg BID. Adverse effects: dyspnea (common, not a contraindication), bleeding, bradycardia. Monitoring: CBC, renal function.",
        },
        {
          heading: "Heparin (UFH)",
          content:
            "Mechanism: potentiates antithrombin III → inhibits thrombin and factor Xa. Dose: 60 U/kg bolus (max 4000 U), then 12 U/kg/h infusion. Monitoring: aPTT (target 1.5-2.5× normal) or anti-Xa levels.",
        },
        {
          heading: "Atorvastatin",
          content:
            "Mechanism: HMG-CoA reductase inhibitor → reduces LDL, stabilizes plaques. Dose: 80 mg daily (high-intensity). Adverse effects: myopathy, hepatotoxicity, rhabdomyolysis (rare). Monitoring: LFTs, CK if symptoms.",
        },
        {
          heading: "Metoprolol",
          content:
            "Mechanism: selective β1-blocker → reduces heart rate, blood pressure, myocardial oxygen demand. Dose: 25-50 mg BID (oral) or 5 mg IV q5min × 3. Contraindications: cardiogenic shock, severe bradycardia, decompensated HF, asthma.",
        },
      ],
      highlights: [
        {
          type: "exam-pearl",
          content:
            "Ticagrelor causes dyspnea in ~14% of patients — this is NOT a reason to discontinue. It is due to adenosine reuptake inhibition.",
        },
      ],
    },
    {
      id: "complications",
      title: "Complications",
      icon: "⚠️",
      badge: "Complications",
      color: "red",
      subsections: [
        {
          heading: "Acute Complications (0-7 days)",
          content:
            "Arrhythmias (VF within first 48h, AF, complete heart block), cardiogenic shock, acute mitral regurgitation (papillary muscle rupture), ventricular free wall rupture (cardiac tamponade), ventricular septal septal rupture (new holosystolic murmur).",
        },
        {
          heading: "Subacute Complications (1-4 weeks)",
          content:
            "LV thrombus (especially anterior MI with akinesia), Dressler syndrome (autoimmune pericarditis, 1-4 weeks post-MI), ventricular aneurysm, mural thrombus embolization.",
        },
        {
          heading: "Chronic Complications",
          content:
            "Chronic heart failure (most common long-term complication), ischemic cardiomyopathy, recurrent angina, depression/PTSD, sudden cardiac death from arrhythmias.",
        },
        {
          heading: "Treatment-Related Complications",
          content:
            "Bleeding from DAPT/anticoagulation, contrast-induced nephropathy from angiography, access site complications (hematoma, pseudoaneurysm, retroperitoneal bleed), stent thrombosis.",
        },
      ],
      highlights: [
        {
          type: "emergency",
          content:
            "Ventricular free wall rupture: sudden hemodynamic collapse, electrical mechanical dissociation, pericardial tamponade. Mortality >90%. Emergent surgery if recognized.",
        },
        {
          type: "warning",
          content:
            "Dressler syndrome: autoimmune pericarditis 1-4 weeks post-MI. Treat with NSAIDs or colchicine. Avoid anticoagulation (risk of hemorrhagic pericarditis).",
        },
      ],
    },
    {
      id: "prognosis",
      title: "Prognosis",
      icon: "📈",
      badge: "Outcomes",
      color: "green",
      subsections: [
        {
          heading: "Natural Course",
          content:
            "Without treatment: 30-day mortality ~30% for STEMI. With modern PCI: 30-day mortality ~5-7%. NSTEMI has lower in-hospital mortality but similar or higher long-term mortality compared to STEMI.",
        },
        {
          heading: "Long-Term Outcomes",
          content:
            "1-year mortality post-AMI: ~10%. 5-year mortality: ~25%. Factors affecting prognosis: LVEF, completeness of revascularization, compliance with medications, cardiac rehabilitation, risk factor modification.",
        },
        {
          heading: "Follow-Up Recommendations",
          content:
            "Cardiology follow-up at 1-2 weeks, 1 month, 3 months, 6 months, then annually. Echocardiogram at 6-8 weeks to reassess LVEF. Cardiac rehabilitation program (36 sessions). Aggressive risk factor modification.",
        },
      ],
      highlights: [
        {
          type: "high-yield",
          content:
            "LVEF is the single strongest predictor of long-term survival post-MI. ACE inhibitors and beta-blockers improve survival in patients with reduced LVEF.",
        },
      ],
    },
    {
      id: "prevention",
      title: "Prevention",
      icon: "🛡️",
      badge: "Prevention",
      color: "teal",
      subsections: [
        {
          heading: "Primary Prevention",
          content:
            "Smoking cessation (single most impactful intervention), blood pressure control (<130/80), diabetes management (HbA1c <7%), statin therapy for elevated LDL, regular exercise (150 min/week moderate intensity), Mediterranean diet, weight management.",
        },
        {
          heading: "Secondary Prevention",
          content:
            "Lifelong aspirin, P2Y12 inhibitor for 12 months, high-intensity statin, beta-blocker, ACE inhibitor (if LVEF <40%), cardiac rehabilitation, annual influenza vaccination, depression screening.",
        },
        {
          heading: "Screening",
          content:
            "Risk assessment with ASCVD risk calculator. Coronary artery calcium (CAC) score for intermediate-risk patients. Stress testing for symptomatic patients or high-risk occupations.",
        },
        {
          heading: "Counseling",
          content:
            "Smoking cessation programs, dietary counseling, exercise prescription, medication adherence education, sexual activity counseling (generally safe 7 days post-MI if stable), driving restrictions (1 week post-MI, longer if complications).",
        },
      ],
      highlights: [
        {
          type: "exam-pearl",
          content:
            "Cardiac rehabilitation reduces cardiovascular mortality by 26% and hospital readmissions by 18%. Yet only 20-30% of eligible patients participate.",
        },
      ],
    },
    {
      id: "clinical-pearls",
      title: "Clinical Pearls",
      icon: "⚡",
      badge: "High-Yield",
      color: "yellow",
      subsections: [
        {
          heading: "High-Yield Facts",
          content:
            "Inferior MI → check RV (V4R) and posterior (V7-V9) leads. Anterior MI → highest mortality. Lateral MI → think LCx occlusion. New LBBB with clinical suspicion = STEMI equivalent.",
        },
        {
          heading: "Exam Pearls",
          content:
            "Wellens syndrome: biphasic T waves in V2-V3 → critical LAD stenosis → do NOT stress test (risk of complete occlusion). De Winter T waves: upsloping ST depression with tall symmetric T waves in precordial leads → LAD occlusion equivalent.",
        },
        {
          heading: "Common Traps",
          content:
            "Normal initial troponin does NOT rule out MI — repeat at 3-6 hours. Young patients with MI: think cocaine, SCAD, hypercoagulable state. Posterior MI: ST depression in V1-V3 is the mirror image of posterior ST elevation.",
        },
        {
          heading: "Must-Not-Miss Findings",
          content:
            "Aortic dissection masquerading as MI — giving anticoagulation can be fatal. Takotsubo cardiomyopathy — mimics STEMI but coronaries are clean. Myocarditis — diffuse ST elevation, young patient, viral prodrome.",
        },
      ],
      highlights: [
        {
          type: "high-yield",
          content:
            "Wellens syndrome: biphasic or deeply inverted T waves in V2-V3 with minimal or no troponin elevation → critical proximal LAD stenosis → needs urgent PCI, NOT stress testing.",
        },
        {
          type: "exam-pearl",
          content:
            "The most common cause of death in the first hour of AMI is ventricular fibrillation. Immediate defibrillation saves lives.",
        },
      ],
    },
    {
      id: "clinical-case",
      title: "Clinical Case",
      icon: "📝",
      badge: "Case Study",
      color: "purple",
      subsections: [
        {
          heading: "Patient Presentation",
          content:
            "A 58-year-old male, smoker with hypertension, presents to the ED with 45 minutes of severe substernal chest pressure radiating to his left arm, associated with diaphoresis and nausea. BP 150/90, HR 98, SpO2 96% on room air.",
        },
        {
          heading: "Diagnostic Reasoning",
          content:
            "ECG shows ST elevation in leads II, III, aVF, and V4R — inferior STEMI with RV involvement. Troponin I returns at 8.2 ng/mL (normal <0.04). Bed echocardiogram shows inferior wall motion abnormality, RV hypokinesis, LVEF estimated at 40%.",
        },
        {
          heading: "Management Reasoning",
          content:
            "Aspirin 325 mg chewed, ticagrelor 180 mg load, heparin bolus and infusion. Avoid nitrates (RV infarction). IV fluids for hypotension. Emergent cardiac catheterization reveals 100% RCA occlusion → successful PCI with drug-eluting stent.",
        },
        {
          heading: "Outcome",
          content:
            "Patient stabilized post-PCI. Started on dual antiplatelet therapy, high-intensity statin, beta-blocker, and ACE inhibitor. Discharged on day 3 with referral to cardiac rehabilitation. At 6-week follow-up, LVEF improved to 50%.",
        },
      ],
      highlights: [
        {
          type: "high-yield",
          content:
            "This case illustrates the importance of right-sided leads (V4R) in inferior MI — identifying RV infarction changes management (fluids instead of nitrates).",
        },
      ],
    },
    {
      id: "evidence",
      title: "Evidence and Guidelines",
      icon: "📑",
      badge: "Guidelines",
      color: "slate",
      subsections: [
        {
          heading: "Guideline Recommendations",
          content:
            "2023 AHA/ACC STEMI Guidelines: Primary PCI preferred over fibrinolysis if door-to-balloon ≤120 min. 2021 AHA/ACC Chest Pain Guidelines: High-sensitivity troponin protocols (0h/1h or 0h/2h) for rapid rule-in/rule-out.",
        },
        {
          heading: "Evidence Grading",
          content:
            "Primary PCI for STEMI: Class I, Level A. DAPT for 12 months post-ACS: Class I, Level A. High-intensity statin therapy: Class I, Level A. Beta-blocker post-MI: Class I, Level B. ACE inhibitor if LVEF <40%: Class I, Level A.",
        },
        {
          heading: "Key References",
          content:
            "O'Gara PT et al. 2013 ACCF/AHA STEMI Guidelines. J Am Coll Cardiol. 2013;61(4):e78-e140. Amsterdam EA et al. 2014 AHA/ACC NSTE-ACS Guidelines. J Am Coll Cardiol. 2014;64(24):e139-e228. Ibanez B et al. 2018 ESC STEMI Guidelines. Eur Heart J. 2018;39(2):119-177.",
        },
      ],
      highlights: [
        {
          type: "exam-pearl",
          content:
            "Know the door-to-balloon time targets: <90 min for primary PCI, <30 min for fibrinolysis if PCI not available within 120 min.",
        },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════
// Component B: Revision Sheet Table
// ═══════════════════════════════════════════════════════════

export interface RevisionRow {
  id: string;
  finding: string;
  significance: string;
  action: string;
}

export const revisionSheetData: RevisionRow[] = [
  {
    id: "r1",
    finding: "ST Elevation in ≥2 contiguous leads",
    significance:
      "Indicates transmural ischemia from complete coronary occlusion. STEMI equivalent requiring emergent reperfusion.",
    action:
      "Activate cath lab immediately. Target door-to-balloon <90 min. Give aspirin 325 mg, heparin bolus, P2Y12 inhibitor load.",
  },
  {
    id: "r2",
    finding: "New LBBB with clinical suspicion",
    significance:
      "STEMI equivalent. Difficult to interpret ECG — treat as STEMI if clinical picture fits (chest pain, hemodynamic instability).",
    action:
      "Treat as STEMI. Emergent PCI or fibrinolysis. Do NOT delay reperfusion waiting for biomarker results.",
  },
  {
    id: "r3",
    finding: "Troponin elevation with ST depression",
    significance:
      "NSTEMI — partial coronary occlusion or microembolization. Higher long-term mortality than STEMI despite lower in-hospital mortality.",
    action:
      "Risk-stratify with TIMI score. High risk → early invasive (<24h). Start DAPT, anticoagulation, statin, beta-blocker.",
  },
  {
    id: "r4",
    finding: "ST depression in V1-V3 with tall R waves",
    significance:
      "Posterior MI — occlusion of LCx or RCA. Often missed on standard 12-lead ECG. Add posterior leads V7-V9.",
    action:
      "Obtain posterior leads. Treat as STEMI if posterior ST elevation confirmed. Emergent PCI.",
  },
  {
    id: "r5",
    finding: "ST elevation in V4R",
    significance:
      "Right ventricular infarction — complicates ~30% of inferior MIs. RV is preload-dependent; nitrates cause catastrophic hypotension.",
    action:
      "Avoid nitrates and morphine. Give IV fluids (500-1000 mL NS). Maintain AV synchrony — avoid nodal blockers.",
  },
  {
    id: "r6",
    finding: "Wellens syndrome (biphasic T in V2-V3)",
    significance:
      "Critical proximal LAD stenosis. Troponin may be normal or minimally elevated. Stress test can precipitate complete occlusion.",
    action:
      "Do NOT stress test. Urgent coronary angiography. PCI of LAD lesion. Medical therapy alone has high mortality.",
  },
  {
    id: "r7",
    finding: "De Winter T waves",
    significance:
      "LAD occlusion equivalent — upsloping ST depression with tall symmetric T waves in precordial leads. Not a benign finding.",
    action: "Treat as STEMI equivalent. Emergent PCI. Do NOT wait for troponin results.",
  },
  {
    id: "r8",
    finding: "New pathological Q waves",
    significance:
      "Indicates completed transmural infarction. May be old or new — correlate with clinical presentation and troponin.",
    action:
      "If new: manage as AMI. If old: assess LV function, evaluate for viability, optimize medical therapy.",
  },
  {
    id: "r9",
    finding: "Killip Class III (pulmonary edema)",
    significance:
      "Severe LV dysfunction with acute pulmonary edema. Mortality ~38%. Requires aggressive diuresis and possible inotropic support.",
    action:
      "IV furosemide, non-invasive ventilation, consider inotropes (dobutamine). Emergent PCI if cardiogenic component.",
  },
  {
    id: "r10",
    finding: "Cardiogenic shock (Killip IV)",
    significance:
      "Most lethal complication of AMI. SBP <90, oliguria, altered mentality. Mortality >80% without revascularization.",
    action:
      "Emergent PCI. Consider mechanical support (IABP, Impella, ECMO). Vasopressors (norepinephrine) and inotropes.",
  },
];

// ═══════════════════════════════════════════════════════════
// Component C: OSCE Station Question
// ═══════════════════════════════════════════════════════════

export interface McqOption {
  id: string;
  label: string;
  text: string;
}

export interface OsceStation {
  stationNumber: number;
  specialty: string;
  title: string;
  timeSeconds: number;
  scenario: string;
  question: string;
  options: McqOption[];
  correctIndex: number;
  explanation: string;
}

export const osceStationData: OsceStation = {
  stationNumber: 3,
  specialty: "Cardiology",
  title: "Chest Pain Assessment",
  timeSeconds: 120,
  scenario:
    "A 62-year-old woman presents to the emergency department with 90 minutes of severe central chest pain. The pain is described as a 'heavy pressure' radiating to both arms and her jaw. She is diaphoretic and nauseated. She has a history of type 2 diabetes, hypertension, and hyperlipidemia. She takes metformin, amlodipine, and atorvastatin. On examination: BP 160/95 mmHg, HR 105 bpm, SpO2 94% on room air, temperature 36.8°C. Chest is clear. Heart sounds normal, no murmurs. ECG shows ST elevation of 2mm in leads V1-V4 with reciprocal ST depression in leads II, III, and aVF.",
  question: "What is the most appropriate immediate management step?",
  options: [
    {
      id: "a",
      label: "A",
      text: "Order a CT pulmonary angiogram to rule out pulmonary embolism",
    },
    {
      id: "b",
      label: "B",
      text: "Activate the cardiac catheterization laboratory for emergent primary PCI",
    },
    {
      id: "c",
      label: "C",
      text: "Administer IV beta-blockers and observe for 24 hours",
    },
    {
      id: "d",
      label: "D",
      text: "Order a stress echocardiogram for risk stratification",
    },
  ],
  correctIndex: 1,
  explanation:
    "This patient has an anterior STEMI (ST elevation in V1-V4). The most appropriate immediate management is emergent primary PCI. Time is muscle — door-to-balloon time should be <90 minutes. CT pulmonary angiogram is not indicated with clear STEMI on ECG. Beta-blockers are contraindicated in the acute setting if there is any concern for hemodynamic instability. Stress testing is absolutely contraindicated in acute STEMI.",
};

// ═══════════════════════════════════════════════════════════
// Component D: Mnemonic Card
// ═══════════════════════════════════════════════════════════

export interface MnemonicLetter {
  letter: string;
  meaning: string;
  color: string; // hex color for the tile
}

export interface MnemonicData {
  word: string;
  topic: string;
  category: string;
  letters: MnemonicLetter[];
  difficulty: number; // 1-5 for spaced repetition
}

export const mnemonicData: MnemonicData = {
  word: "CARDIAC",
  topic: "Management of Acute Myocardial Infarction",
  category: "Emergency Medicine",
  letters: [
    {
      letter: "C",
      meaning: "Chew Aspirin 325 mg",
      color: "#8E24AA",
    },
    {
      letter: "A",
      meaning: "Activate Cath Lab (PCI within 90 min)",
      color: "#AB47BC",
    },
    {
      letter: "R",
      meaning: "Reperfusion — PCI or thrombolysis",
      color: "#CE93D8",
    },
    {
      letter: "D",
      meaning: "Dual antiplatelet therapy (Aspirin + Ticagrelor)",
      color: "#E1BEE7",
    },
    {
      letter: "I",
      meaning: "IV Heparin (anticoagulation)",
      color: "#F3E5F5",
    },
    {
      letter: "A",
      meaning: "ACE inhibitor (if LVEF <40%)",
      color: "#BA68C8",
    },
    {
      letter: "C",
      meaning: "Cardiac rehabilitation referral",
      color: "#9C27B0",
    },
  ],
  difficulty: 3,
};

// ═══════════════════════════════════════════════════════════
// Component E: Clinical Pearls Card Stack
// ═══════════════════════════════════════════════════════════

export interface ClinicalPearl {
  id: string;
  label: string;
  title: string;
  body: string;
  category: string;
}

export const clinicalPearlsData: ClinicalPearl[] = [
  {
    id: "p1",
    label: "High-Yield Pearl",
    title: "Wellens Syndrome — Do NOT Stress Test",
    body: "Biphasic or deeply inverted T waves in V2-V3 with minimal troponin elevation indicate critical proximal LAD stenosis. These patients need urgent PCI, not stress testing — which can precipitate complete occlusion and cardiac arrest.",
    category: "Cardiology",
  },
  {
    id: "p2",
    label: "Emergency Pearl",
    title: "RV Infarction — Fluids, Not Nitrates",
    body: "Inferior MI with hypotension and clear lungs? Think RV infarction. Check V4R. The RV is preload-dependent — nitrates cause catastrophic hypotension. Give IV fluids aggressively and avoid all preload-reducing agents.",
    category: "Cardiology",
  },
  {
    id: "p3",
    label: "Exam Pearl",
    title: "De Winter T Waves — STEMI Equivalent",
    body: "Upsloping ST depression with tall, symmetric T waves in the precordial leads is a STEMI equivalent indicating acute LAD occlusion. Do not be reassured by the absence of ST elevation — these patients need emergent PCI.",
    category: "Cardiology",
  },
  {
    id: "p4",
    label: "Clinical Pearl",
    title: "Posterior MI — Look at V1-V3",
    body: "ST depression in V1-V3 with tall R waves is the mirror image of posterior ST elevation. Add posterior leads (V7-V9) to confirm. Often caused by LCx or RCA occlusion. Treat as STEMI if confirmed.",
    category: "Cardiology",
  },
  {
    id: "p5",
    label: "Must-Know Pearl",
    title: "Aortic Dissection — Rule Out Before Anticoagulation",
    body: "Tearing chest pain radiating to the back with blood pressure differential between arms? Think aortic dissection. NEVER give anticoagulation or antiplatelets until dissection is ruled out — CT angiography is the test of choice.",
    category: "Emergency Medicine",
  },
];
