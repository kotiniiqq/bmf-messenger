export interface NoteRow {
  id: string;
  userId: string;
  title: string;
  body: string;
  folder: string | null;
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
