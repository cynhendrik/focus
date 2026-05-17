use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use crate::AppError;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: String,
    pub account_id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub id: String,
    pub account_id: String,
    pub folder_id: Option<String>,
    pub name: String,
    pub path: String,
    pub size: Option<i64>,
    pub mime_type: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFolderPayload {
    pub account_id: String,
    pub name: String,
    pub parent_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddFilePayload {
    pub account_id: String,
    pub folder_id: Option<String>,
    pub name: String,
    pub path: String,
    pub size: Option<i64>,
    pub mime_type: Option<String>,
}

pub fn get_folders(conn: &Connection, account_id: &str) -> Result<Vec<Folder>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, account_id, name, parent_id, created_at
         FROM folders WHERE account_id = ?1 ORDER BY name ASC",
    )?;
    let folders = stmt
        .query_map([account_id], |row| {
            Ok(Folder {
                id: row.get(0)?, account_id: row.get(1)?,
                name: row.get(2)?, parent_id: row.get(3)?, created_at: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(folders)
}

pub fn create_folder(conn: &Connection, payload: CreateFolderPayload) -> Result<Folder, AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO folders (id, account_id, name, parent_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, payload.account_id, payload.name, payload.parent_id, now],
    )?;
    Ok(Folder { id, account_id: payload.account_id, name: payload.name, parent_id: payload.parent_id, created_at: now })
}

pub fn delete_folder(conn: &Connection, id: &str) -> Result<(), AppError> {
    let affected = conn.execute("DELETE FROM folders WHERE id = ?1", [id])?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("Folder {id} not found")));
    }
    Ok(())
}

pub fn get_files(conn: &Connection, account_id: &str, folder_id: Option<&str>) -> Result<Vec<FileEntry>, AppError> {
    if let Some(fid) = folder_id {
        let mut stmt = conn.prepare(
            "SELECT id, account_id, folder_id, name, path, size, mime_type, created_at
             FROM files WHERE account_id = ?1 AND folder_id = ?2 ORDER BY name ASC",
        )?;
        let files = stmt.query_map(rusqlite::params![account_id, fid], |row| Ok(FileEntry {
            id: row.get(0)?, account_id: row.get(1)?, folder_id: row.get(2)?,
            name: row.get(3)?, path: row.get(4)?, size: row.get(5)?,
            mime_type: row.get(6)?, created_at: row.get(7)?,
        }))?.collect::<Result<Vec<_>, _>>()?;
        Ok(files)
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, account_id, folder_id, name, path, size, mime_type, created_at
             FROM files WHERE account_id = ?1 AND folder_id IS NULL ORDER BY name ASC",
        )?;
        let files = stmt.query_map([account_id], |row| Ok(FileEntry {
            id: row.get(0)?, account_id: row.get(1)?, folder_id: row.get(2)?,
            name: row.get(3)?, path: row.get(4)?, size: row.get(5)?,
            mime_type: row.get(6)?, created_at: row.get(7)?,
        }))?.collect::<Result<Vec<_>, _>>()?;
        Ok(files)
    }
}

pub fn add_file(conn: &Connection, payload: AddFilePayload) -> Result<FileEntry, AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO files (id, account_id, folder_id, name, path, size, mime_type, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![id, payload.account_id, payload.folder_id, payload.name, payload.path, payload.size, payload.mime_type, now],
    )?;
    Ok(FileEntry { id, account_id: payload.account_id, folder_id: payload.folder_id, name: payload.name, path: payload.path, size: payload.size, mime_type: payload.mime_type, created_at: now })
}

pub fn delete_file(conn: &Connection, id: &str) -> Result<(), AppError> {
    let affected = conn.execute("DELETE FROM files WHERE id = ?1", [id])?;
    if affected == 0 {
        return Err(AppError::NotFound(format!("File {id} not found")));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{schema, migrations};

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        schema::create_tables(&conn).unwrap();
        migrations::run(&conn).unwrap();
        conn
    }

    #[test]
    fn create_and_list_folder() {
        let conn = setup();
        create_folder(&conn, CreateFolderPayload {
            account_id: "__cynera_privat__".to_string(),
            name: "Verträge".to_string(), parent_id: None,
        }).unwrap();
        let folders = get_folders(&conn, "__cynera_privat__").unwrap();
        assert_eq!(folders.len(), 1);
        assert_eq!(folders[0].name, "Verträge");
    }

    #[test]
    fn add_file_to_folder() {
        let conn = setup();
        let folder = create_folder(&conn, CreateFolderPayload {
            account_id: "__cynera_privat__".to_string(),
            name: "Docs".to_string(), parent_id: None,
        }).unwrap();
        add_file(&conn, AddFilePayload {
            account_id: "__cynera_privat__".to_string(),
            folder_id: Some(folder.id.clone()),
            name: "vertrag.pdf".to_string(),
            path: "/home/user/vertrag.pdf".to_string(),
            size: Some(102400), mime_type: Some("application/pdf".to_string()),
        }).unwrap();
        let files = get_files(&conn, "__cynera_privat__", Some(&folder.id)).unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].name, "vertrag.pdf");
    }

    #[test]
    fn delete_folder_cascades_files() {
        let conn = setup();
        let folder = create_folder(&conn, CreateFolderPayload {
            account_id: "__cynera_privat__".to_string(),
            name: "Temp".to_string(), parent_id: None,
        }).unwrap();
        add_file(&conn, AddFilePayload {
            account_id: "__cynera_privat__".to_string(),
            folder_id: Some(folder.id.clone()),
            name: "file.txt".to_string(), path: "/tmp/file.txt".to_string(),
            size: None, mime_type: None,
        }).unwrap();
        delete_folder(&conn, &folder.id).unwrap();
        assert_eq!(get_folders(&conn, "__cynera_privat__").unwrap().len(), 0);
        assert_eq!(get_files(&conn, "__cynera_privat__", None).unwrap().len(), 0);
    }
}
