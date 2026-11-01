-- CiteBase schema.
-- Runs once, on the first start of an empty data volume (docker-entrypoint-initdb.d).
-- Everything is idempotent so a manual re-run during development is safe.

create extension if not exists vector;

-- ---------------------------------------------------------------- documents
create table if not exists documents (
  id          text primary key,
  filename    text        not null,
  mime        text        not null,
  size_bytes  integer     not null,
  sha256      text        not null,
  page_count  integer     not null default 0,
  chunk_count integer     not null default 0,
  status      text        not null default 'pending',
  error       text,
  created_at  timestamptz not null default now()
);

-- Same file uploaded twice must not consume embedding twice.
create unique index if not exists documents_sha_idx on documents (sha256);
create index if not exists documents_created_idx on documents (created_at desc);

-- ------------------------------------------------------------------- chunks
-- search_text holds the tokenised form (CJK bigrams + lowercase words) because
-- the default Postgres parser does not split Chinese: without it the whole
-- paragraph becomes a single lexeme and keyword recall collapses to zero.
create table if not exists chunks (
  id           bigserial primary key,
  doc_id       text    not null references documents (id) on delete cascade,
  ordinal      integer not null,
  page         integer not null default 1,
  heading_path text    not null default '',
  content      text    not null,
  char_start   integer not null default 0,
  char_end     integer not null default 0,
  search_text  text    not null default '',
  tokens       tsvector,
  embedding    vector(384) not null
);

create index if not exists chunks_doc_idx on chunks (doc_id, ordinal);
create index if not exists chunks_tokens_idx on chunks using gin (tokens);
-- HNSW gives usable recall without a training step (IVFFlat needs data first).
create index if not exists chunks_embedding_idx
  on chunks using hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------- query log
create table if not exists query_logs (
  id            bigserial primary key,
  question      text        not null,
  mode          text        not null,
  retrieved_ids bigint[]    not null default '{}',
  cited_ids     bigint[]    not null default '{}',
  latency_ms    integer     not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists query_logs_created_idx on query_logs (created_at desc);

-- ----------------------------------------------------------------- eval run
create table if not exists eval_runs (
  id             bigserial primary key,
  recall_at_5    numeric(5, 4) not null,
  citation_hit   numeric(5, 4) not null,
  refusal_acc    numeric(5, 4) not null,
  total          integer        not null,
  detail         jsonb          not null default '[]'::jsonb,
  created_at     timestamptz    not null default now()
);
