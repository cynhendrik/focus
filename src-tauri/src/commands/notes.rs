use tauri::State;
use crate::{
    AppError,
    db::{
        pool::DbPool,
        note_entry::{NoteEntry, CreateNoteEntryPayload, UpdateNoteEntryPayload},
        note_doc::{NoteDoc, CreateNoteDocPayload, UpdateNoteDocPayload},
        note_folder::{NoteFolder, CreateNoteFolderPayload, UpdateNoteFolderPayload},
    },
};

#[tauri::command]
pub fn get_note_entries(db: State<'_, DbPool>, account_id: String) -> Result<Vec<NoteEntry>, AppError> {
    let conn = db.conn();
    crate::db::note_entry::get_by_account(&*conn, &account_id)
}

#[tauri::command]
pub fn create_note_entry(db: State<'_, DbPool>, payload: CreateNoteEntryPayload) -> Result<NoteEntry, AppError> {
    let conn = db.conn();
    crate::db::note_entry::insert(&*conn, payload)
}

#[tauri::command]
pub fn update_note_entry(db: State<'_, DbPool>, id: String, payload: UpdateNoteEntryPayload) -> Result<NoteEntry, AppError> {
    let conn = db.conn();
    crate::db::note_entry::update(&*conn, &id, payload)
}

#[tauri::command]
pub fn delete_note_entry(db: State<'_, DbPool>, id: String) -> Result<(), AppError> {
    let conn = db.conn();
    crate::db::note_entry::delete(&*conn, &id)
}

#[tauri::command]
pub fn get_note_docs(db: State<'_, DbPool>, account_id: String) -> Result<Vec<NoteDoc>, AppError> {
    let conn = db.conn();
    crate::db::note_doc::get_by_account(&*conn, &account_id)
}

#[tauri::command]
pub fn create_note_doc(db: State<'_, DbPool>, payload: CreateNoteDocPayload) -> Result<NoteDoc, AppError> {
    let conn = db.conn();
    crate::db::note_doc::insert(&*conn, payload)
}

#[tauri::command]
pub fn update_note_doc(db: State<'_, DbPool>, id: String, payload: UpdateNoteDocPayload) -> Result<NoteDoc, AppError> {
    let conn = db.conn();
    crate::db::note_doc::update(&*conn, &id, payload)
}

#[tauri::command]
pub fn delete_note_doc(db: State<'_, DbPool>, id: String) -> Result<(), AppError> {
    let conn = db.conn();
    crate::db::note_doc::delete(&*conn, &id)
}

#[tauri::command]
pub fn get_note_folders(db: State<'_, DbPool>, account_id: String) -> Result<Vec<NoteFolder>, AppError> {
    let conn = db.conn();
    crate::db::note_folder::get_by_account(&*conn, &account_id)
}

#[tauri::command]
pub fn create_note_folder(db: State<'_, DbPool>, payload: CreateNoteFolderPayload) -> Result<NoteFolder, AppError> {
    let conn = db.conn();
    crate::db::note_folder::insert(&*conn, payload)
}

#[tauri::command]
pub fn update_note_folder(db: State<'_, DbPool>, id: String, payload: UpdateNoteFolderPayload) -> Result<NoteFolder, AppError> {
    let conn = db.conn();
    crate::db::note_folder::update(&*conn, &id, payload)
}

#[tauri::command]
pub fn delete_note_folder(db: State<'_, DbPool>, id: String) -> Result<(), AppError> {
    let conn = db.conn();
    crate::db::note_folder::delete(&*conn, &id)
}
