-- Campus navigation: QR codes, search keywords, restricted places. Safe to run more than once.
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE navigation_nodes
  ADD COLUMN IF NOT EXISTS classroom_id UUID REFERENCES classrooms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS qr_code TEXT,
  ADD COLUMN IF NOT EXISTS keywords TEXT,
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT TRUE;   -- FALSE = staff only (teacher / hod / admin)

CREATE UNIQUE INDEX IF NOT EXISTS idx_nav_nodes_qr ON navigation_nodes (qr_code) WHERE qr_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nav_nodes_building_floor ON navigation_nodes (building_id, floor_number);
CREATE INDEX IF NOT EXISTS idx_nav_edges_src ON navigation_edges (source_node_id);
CREATE INDEX IF NOT EXISTS idx_nav_edges_dst ON navigation_edges (destination_node_id);
