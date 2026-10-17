CREATE TABLE public.user_sessions (
  token_hash VARCHAR(64) PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  password_fingerprint VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT user_sessions_lifetime CHECK (expires_at > created_at AND expires_at <= created_at + INTERVAL '1 hour')
);
CREATE INDEX user_sessions_user_id_created_at_idx ON public.user_sessions(user_id, created_at);
CREATE INDEX user_sessions_expires_at_idx ON public.user_sessions(expires_at);
CREATE TABLE public.api_rate_limits (
  key VARCHAR(64) PRIMARY KEY,
  count INTEGER NOT NULL CHECK (count > 0),
  expires_at TIMESTAMPTZ(6) NOT NULL
);
CREATE INDEX api_rate_limits_expires_at_idx ON public.api_rate_limits(expires_at);
