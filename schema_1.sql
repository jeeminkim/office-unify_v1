-- pgvector 확장 활성화 (필수)
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. 지출 내역 (Expenses)
CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR NOT NULL, -- Discord User ID
    amount DECIMAL NOT NULL,
    category VARCHAR NOT NULL,
    description TEXT,
    date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 주식 종목 마스터 (Stocks) - 신규 확장
CREATE TABLE stocks (
    symbol VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    sector VARCHAR
);

-- 3. 보유 종목 (Portfolio) - 스키마 업데이트
CREATE TABLE portfolio (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR NOT NULL, -- Discord User ID
    symbol VARCHAR NOT NULL, -- 마스터 테이블과 연계 추천 (REFERENCES stocks(symbol) 생략 가능)
    quantity DECIMAL NOT NULL,
    avg_purchase_price DECIMAL NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. 대화 로그 (Chat History) - 다중 에이전트 결괏값 통합 저장 구조로 변경
CREATE TABLE chat_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR NOT NULL, -- Discord User ID
    user_query TEXT NOT NULL,
    ray_advice TEXT,
    jyp_insight TEXT,
    drucker_decision TEXT,
    embedding VECTOR(768), 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- HNSW Vector Index 생성 (나중에 RAG 도입 시 사용)
CREATE INDEX ON chat_history USING hnsw (embedding vector_cosine_ops);
