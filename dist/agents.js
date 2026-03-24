"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.StanleyDruckenmillerAgent = exports.PeterDruckerAgent = exports.JamesSimonsAgent = exports.JYPAgent = exports.RayDalioAgent = exports.BaseAgent = void 0;
exports.hasRequiredAnchoredData = hasRequiredAnchoredData;
exports.buildAnchoredSummary = buildAnchoredSummary;
const genai_1 = require("@google/genai");
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv = __importStar(require("dotenv"));
const logger_1 = require("./logger");
dotenv.config();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ai = new genai_1.GoogleGenAI({ apiKey: GEMINI_API_KEY });
const supabase = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_SERVICE_KEY);
function hasRequiredAnchoredData(context) {
    const reasons = [];
    if (!context || !context.portfolio || context.portfolio.length === 0)
        reasons.push("포트폴리오(자산) 데이터가 없습니다.");
    const expLen = context.expenses ? context.expenses.length : 0;
    const cfLen = context.cashflow ? context.cashflow.length : 0;
    if (expLen === 0 && cfLen === 0) {
        reasons.push("지출 또는 현금흐름 데이터가 최소 하나 이상 필요합니다.");
    }
    return {
        ok: reasons.length === 0,
        reasons
    };
}
function buildAnchoredSummary(context) {
    return {
        portfolio: {
            count: context.portfolio ? context.portfolio.length : 0,
            snapshot: (context.portfolio || []).map(p => `${p.symbol}: ${p.quantity}주 (평단 ${p.avg_purchase_price})`)
        },
        expenses: {
            count: context.expenses ? context.expenses.length : 0,
            snapshot: (context.expenses || []).slice(0, 5).map(e => `${e.category}: ${e.amount}`)
        },
        cashflow: {
            count: context.cashflow ? context.cashflow.length : 0,
            snapshot: (context.cashflow || []).slice(0, 5).map(c => `[${c.flow_type}] ${c.amount}`)
        }
    };
}
const CommonProtocol = `
[CORE_OPERATIONAL_LOGIC]
1. DATA_ANCHORING: Analysis affecting user finances MUST use anchored data (portfolio/expenses/cashflow).
2. NO_SPECULATION: Do NOT speculate on absent financial data or prices.
3. OUTPUT_PROTOCOL: Tone MUST be concise, structured, and professional (like an 8-year developer colleague).
`;
class BaseAgent {
    constructor(systemPrompt) {
        this.supabase = supabase;
        this.ai = ai;
        this.systemPrompt = systemPrompt;
        this.context = { portfolio: [], expenses: [], cashflow: [] };
    }
    async initializeContext(userId) {
        try {
            // SCHEMA-SAFE LOADING: Removed .order('date') to prevent crash on missing column in production
            const [portfolioRes, expensesRes, cashflowRes] = await Promise.all([
                this.supabase.from('portfolio').select('*').eq('user_id', userId),
                this.supabase.from('expenses').select('*').eq('user_id', userId).limit(50),
                this.supabase.from('cashflow').select('*').eq('user_id', userId).limit(50)
            ]);
            if (portfolioRes.error)
                throw new Error(`Portfolio fetch error: ${portfolioRes.error.message}`);
            if (expensesRes.error)
                throw new Error(`Expenses fetch error: ${expensesRes.error.message}`);
            if (cashflowRes.error)
                throw new Error(`Cashflow fetch error: ${cashflowRes.error.message}`);
            this.context.portfolio = portfolioRes.data || [];
            this.context.expenses = expensesRes.data || [];
            this.context.cashflow = cashflowRes.data || [];
            (0, logger_1.updateHealth)(s => s.db.lastContextError = null);
        }
        catch (e) {
            logger_1.logger.error('DATABASE', "Context Data Log Init Error", e);
            (0, logger_1.updateHealth)(s => s.db.lastContextError = e.message);
            // Fail gracefully -> context remains empty -> NO_DATA gate triggers safely, avoiding unhandled crashing on startup
        }
    }
    async validateAndGenerate(query, isTrendQuery, additionalLog = '') {
        const validation = hasRequiredAnchoredData(this.context);
        if (!isTrendQuery && !validation.ok) {
            return `분석에 필요한 앵커 데이터가 부족합니다.\n사유: ${validation.reasons.join(", ")}\n[REASON: NO_DATA]`;
        }
        return this.generateResponse(query, isTrendQuery, additionalLog);
    }
    async generateResponse(query, isTrendQuery, additionalLog = '') {
        const summary = buildAnchoredSummary(this.context);
        const hasData = hasRequiredAnchoredData(this.context).ok;
        const fullPrompt = `
${this.systemPrompt}

[Mode]
This query is flagged as: ${isTrendQuery ? "TREND & WORLD KNOWLEDGE QUERY" : "STRICT FINANCIAL QUERY"}
If Trend Query and no data: Answer based on trend insights but explicitly state "현재 재무 데이터가 없어 트렌드 중심으로 분석합니다."
If Financial Query and no data: You should have been hard-gated, but if you reached here, return [REASON: NO_DATA].

[Anchored Data Summary]
Data Present: ${hasData}
${JSON.stringify(summary, null, 2)}

${additionalLog ? `[Previous Analysis]\n${additionalLog}\n` : ''}
[User Query]
${query}
`;
        try {
            const response = await this.ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: fullPrompt,
            });
            return response.text || '';
        }
        catch (e) {
            logger_1.logger.error('AI', 'Gemini API Error', e);
            return `AI 모델 호출 중 오류가 발생했습니다: ${e.message}\n[REASON: NO_DATA]`;
        }
    }
}
exports.BaseAgent = BaseAgent;
class RayDalioAgent extends BaseAgent {
    constructor() {
        super(`[System Role]\n${CommonProtocol}\n# RAY_DALIO: 리스크 전담 분석관.\n오직 리스크만 분석하고 수익 기회/매수 추천은 하지 마라.\n리스크가 임계치를 넘으면 반드시 "방어 기제 작동" 문구를 포함하라.\n\n[OUTPUT STRUCTURE]\n## Risk Summary\n- 핵심 리스크 3개\n## Defensive Triggers\n- 트리거 조건 2~3개\n## Monitoring Metrics\n- 추적 지표 2~3개`);
    }
    async analyze(query, isTrendQuery) {
        return this.validateAndGenerate(query, isTrendQuery);
    }
}
exports.RayDalioAgent = RayDalioAgent;
class JYPAgent extends BaseAgent {
    constructor() {
        super(`[System Role]\n${CommonProtocol}\n# JYP_ANALYST: 소비 + K-Culture + Weekly Report 담당.\n소비 구조를 분석하고 K-Culture(음악/드라마/콘텐츠) 주간 리포트를 생성하라.\n콘텐츠 트렌드를 투자 가능 기회와 연결하라.\n\n[OUTPUT STRUCTURE]\n## Consumption Quality\n- 개선 포인트 2~3개\n## Weekly K-Culture Report\n- 이번 주 핵심 트렌드 3개\n## Trend-to-Invest Mapping\n- 트렌드별 투자 연결 아이디어 2~3개`);
    }
    async inspire(query, isTrendQuery, rayLog) {
        return this.validateAndGenerate(query, isTrendQuery, `[Ray's Analysis]\n${rayLog}`);
    }
}
exports.JYPAgent = JYPAgent;
class JamesSimonsAgent extends BaseAgent {
    constructor() {
        super(`[System Role]\n${CommonProtocol}\n# JAMES_SIMONS: Opportunity + Trend Mapping 담당.\n트렌드를 investable asset으로 매핑하고 Opportunity Score를 산출하라.\n점수는 0~100으로 제시하며, 근거를 짧게 붙여라.\n\n[OUTPUT STRUCTURE]\n## Trend Map\n- Trend -> Asset 3~5개\n## Opportunity Score\n- Asset별 점수(0~100) + 근거 1줄\n## Positioning Candidates\n- 후보 포지션 2~3개`);
    }
    async strategize(query, isTrendQuery, prevLogs) {
        return this.validateAndGenerate(query, isTrendQuery, `[Previous Logs]\n${prevLogs}`);
    }
}
exports.JamesSimonsAgent = JamesSimonsAgent;
class PeterDruckerAgent extends BaseAgent {
    constructor() {
        super(`[System Role]\n${CommonProtocol}\n# PETER_DRUCKER: 실행 지향 COO.\n반드시 3단계 실행 계획만 출력하라. 각 단계는 숫자와 조건을 포함해야 한다.\n(예: 비중 %, 손절/재평가 조건, 기간/기준값)\n\n[OUTPUT STRUCTURE]\n## 3-Step Action Plan\n1) [Action] 수치 + 조건\n2) [Action] 수치 + 조건\n3) [Action] 수치 + 조건`);
    }
    async summarizeAndGenerateActions(isTrendQuery, combinedLog) {
        return this.validateAndGenerate("앞선 세 명의 의견을 종합하여 정확히 3줄의 3가지 핵심 Action Plan을 도출하라.", isTrendQuery, combinedLog);
    }
}
exports.PeterDruckerAgent = PeterDruckerAgent;
class StanleyDruckenmillerAgent extends BaseAgent {
    constructor() {
        super(`[System Role]\n${CommonProtocol}\n# STANLEY_DRUCKENMILLER: CIO Final Decision.\nRay/JYP/Simons/Drucker 결과를 최종 의사결정으로 통합하라.\n최종 결론은 GO / HOLD / NO 중 하나여야 하며, 확신도/포지셔닝/타이밍을 반드시 포함하라.\n\n[OUTPUT STRUCTURE - STRICT]\n## CIO Decision\n- Verdict: GO | HOLD | NO\n- Conviction Level: Low | Medium | High\n- Positioning: (예: 현금 40%, 주식 60% 등)\n- Timing: (즉시/분할/관망 + 조건)\n## Rationale\n- 근거 3줄 이내`);
    }
    async decide(isTrendQuery, combinedLog) {
        return this.validateAndGenerate("최종 CIO 의사결정을 산출하라.", isTrendQuery, combinedLog);
    }
}
exports.StanleyDruckenmillerAgent = StanleyDruckenmillerAgent;
