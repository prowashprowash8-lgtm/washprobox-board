-- Table pour les messages des gérants de résidence
CREATE TABLE IF NOT EXISTS residence_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_email TEXT NOT NULL,
  emplacement_id UUID REFERENCES emplacements(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved', 'closed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Index pour les performances
CREATE INDEX IF NOT EXISTS idx_residence_messages_sender_id ON residence_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_residence_messages_emplacement_id ON residence_messages(emplacement_id);
CREATE INDEX IF NOT EXISTS idx_residence_messages_status ON residence_messages(status);
CREATE INDEX IF NOT EXISTS idx_residence_messages_created_at ON residence_messages(created_at DESC);

-- Trigger pour updated_at
CREATE OR REPLACE FUNCTION update_residence_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_residence_messages_updated_at ON residence_messages;
CREATE TRIGGER trigger_update_residence_messages_updated_at
  BEFORE UPDATE ON residence_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_residence_messages_updated_at();

-- Table pour les réponses aux messages
CREATE TABLE IF NOT EXISTS residence_message_replies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES residence_messages(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_email TEXT NOT NULL,
  reply TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour les performances
CREATE INDEX IF NOT EXISTS idx_residence_message_replies_message_id ON residence_message_replies(message_id);
CREATE INDEX IF NOT EXISTS idx_residence_message_replies_sender_id ON residence_message_replies(sender_id);
CREATE INDEX IF NOT EXISTS idx_residence_message_replies_created_at ON residence_message_replies(created_at DESC);

-- RLS Policies
ALTER TABLE residence_messages ENABLE ROW LEVEL SECURITY;

-- Les gérants de résidence peuvent voir leurs propres messages
DROP POLICY IF EXISTS "residence_managers_can_view_own_messages" ON residence_messages;
CREATE POLICY "residence_managers_can_view_own_messages"
  ON residence_messages FOR SELECT
  USING (
    sender_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM board_account_roles
      WHERE board_account_roles.user_id = auth.uid()
      AND board_account_roles.role = 'patron'
    )
  );

-- Les gérants de résidence peuvent insérer des messages
DROP POLICY IF EXISTS "residence_managers_can_insert_messages" ON residence_messages;
CREATE POLICY "residence_managers_can_insert_messages"
  ON residence_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM board_account_roles
      WHERE board_account_roles.user_id = auth.uid()
      AND board_account_roles.role = 'residence'
    )
  );

-- Les patrons peuvent mettre à jour les messages (changer le statut)
DROP POLICY IF EXISTS "patrons_can_update_messages" ON residence_messages;
CREATE POLICY "patrons_can_update_messages"
  ON residence_messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM board_account_roles
      WHERE board_account_roles.user_id = auth.uid()
      AND board_account_roles.role = 'patron'
    )
  );

-- Les patrons peuvent supprimer les messages
DROP POLICY IF EXISTS "patrons_can_delete_messages" ON residence_messages;
CREATE POLICY "patrons_can_delete_messages"
  ON residence_messages FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM board_account_roles
      WHERE board_account_roles.user_id = auth.uid()
      AND board_account_roles.role = 'patron'
    )
  );

-- RLS pour les réponses
ALTER TABLE residence_message_replies ENABLE ROW LEVEL SECURITY;

-- Les gérants de résidence peuvent voir les réponses à leurs messages
DROP POLICY IF EXISTS "residence_managers_can_view_replies_to_own_messages" ON residence_message_replies;
CREATE POLICY "residence_managers_can_view_replies_to_own_messages"
  ON residence_message_replies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM residence_messages
      WHERE residence_messages.id = residence_message_replies.message_id
      AND residence_messages.sender_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM board_account_roles
      WHERE board_account_roles.user_id = auth.uid()
      AND board_account_roles.role = 'patron'
    )
  );

-- Les gérants de résidence peuvent insérer des réponses
DROP POLICY IF EXISTS "residence_managers_can_insert_replies" ON residence_message_replies;
CREATE POLICY "residence_managers_can_insert_replies"
  ON residence_message_replies FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM residence_messages
      WHERE residence_messages.id = residence_message_replies.message_id
      AND (
        residence_messages.sender_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM board_account_roles
          WHERE board_account_roles.user_id = auth.uid()
          AND board_account_roles.role = 'patron'
        )
      )
    )
  );

-- Les patrons peuvent supprimer les réponses
DROP POLICY IF EXISTS "patrons_can_delete_replies" ON residence_message_replies;
CREATE POLICY "patrons_can_delete_replies"
  ON residence_message_replies FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM board_account_roles
      WHERE board_account_roles.user_id = auth.uid()
      AND board_account_roles.role = 'patron'
    )
  );
