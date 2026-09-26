export interface FileDetails {
  id?: string;
  name: string;
  size: number;
  type: string;
}

export type ScannedFile = FileDetails & {
  scanStatus: 'unscanned' | 'scanning' | 'scanned' | 'failed';
};

export type Permission = "View Only" | "Download" | "Editor";

export interface SignalingData {
  id: string;
  created_at: string;
  short_code?: string;
}

export type ConnectionMode = 'none' | 'create' | 'join';
