import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../../store";
import { toast } from "../ui/Toast";
import { Modal } from "../ui/Modal";

// ── Helpers ─────────────────────────────────────────────────────────────────

const fmtSize = (b) => {
  if (!b) return "";
  if (b < 1024) return b + " B";
  if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
  return (b / 1048576).toFixed(1) + " MB";
};

const fileCat = (type = "", name = "") => {
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (/\.(docx?|odt)$/i.test(name)) return "doc";
  if (/\.(xlsx?|csv|ods)$/i.test(name)) return "sheet";
  if (/\.(zip|rar|7z|tar\.gz?|gz)$/i.test(name)) return "archive";
  return "other";
};

const CAT_META = {
  image:   { icon: "🖼", color: "#60A5FA", bg: "rgba(96,165,250,0.1)" },
  pdf:     { icon: "📄", color: "#F87171", bg: "rgba(248,113,113,0.1)" },
  video:   { icon: "🎬", color: "#FBBF24", bg: "rgba(251,191,36,0.1)" },
  audio:   { icon: "🎵", color: "#A78BFA", bg: "rgba(124,58,237,0.1)" },
  doc:     { icon: "📝", color: "#60A5FA", bg: "rgba(96,165,250,0.1)" },
  sheet:   { icon: "📊", color: "#34D399", bg: "rgba(52,211,153,0.1)" },
  archive: { icon: "🗜", color: "#FBBF24", bg: "rgba(251,191,36,0.1)" },
  other:   { icon: "📎", color: "#9CA3AF", bg: "rgba(156,163,175,0.08)" },
};

// ── SVG Icons ────────────────────────────────────────────────────────────────

const PencilIcon = () => (
  <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
  </svg>
);
const TrashIcon = () => (
  <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
  </svg>
);
const DownloadIcon = () => (
  <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
  </svg>
);
const GridIcon = () => (
  <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
      d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"/>
  </svg>
);
const ListViewIcon = () => (
  <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
  </svg>
);
const FolderPlusIcon = () => (
  <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
      d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2z"/>
  </svg>
);
const UploadIcon = () => (
  <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
  </svg>
);
const ChevronIcon = () => (
  <svg width="9" height="9" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7"/>
  </svg>
);
const EyeIcon = () => (
  <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
  </svg>
);

// ── Folder SVG ────────────────────────────────────────────────────────────────

function FolderSvg({ size = 44 }) {
  return (
    <svg width={size} height={size * 0.82} viewBox="0 0 44 36" fill="none">
      <path
        d="M2 7C2 4.79 3.79 3 6 3h10l4 4h18c2.21 0 4 1.79 4 4v22c0 2.21-1.79 4-4 4H6c-2.21 0-4-1.79-4-4V7z"
        fill="rgba(124,58,237,0.18)" stroke="rgba(124,58,237,0.25)" strokeWidth="0.75"
      />
      <path
        d="M2 13h40v18c0 2.21-1.79 4-4 4H6c-2.21 0-4-1.79-4-4V13z"
        fill="rgba(124,58,237,0.28)" stroke="rgba(124,58,237,0.2)" strokeWidth="0.75"
      />
    </svg>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ActionBtn({ title, danger, onClick, children }) {
  const [h, setH] = useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: 22, height: 22, borderRadius: 6, border: "none", cursor: "pointer",
        background: h ? (danger ? "rgba(239,68,68,0.18)" : "var(--bg5)") : "var(--bg4)",
        color: h ? (danger ? "var(--red)" : "var(--text2)") : "var(--text3)",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.12s",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

function RenameInput({ value, onChange, onCommit, onCancel }) {
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") onCommit();
        if (e.key === "Escape") onCancel();
      }}
      onClick={(e) => e.stopPropagation()}
      style={{
        width: "100%", background: "var(--bg4)",
        border: "1px solid rgba(124,58,237,0.45)",
        borderRadius: 5, color: "var(--text)", fontSize: 11,
        fontFamily: "inherit", outline: "none", padding: "2px 6px",
        textAlign: "center",
      }}
    />
  );
}

function FolderCard({ folder, fileCount, index, onOpen, onRename, onDelete, renaming, renameValue, onRenameChange, onRenameCommit, onRenameCancel }) {
  const [hov, setHov] = useState(false);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.88 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.88 }}
      transition={{ duration: 0.2, delay: index * 0.025 }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onDoubleClick={onOpen}
      style={{
        position: "relative",
        padding: "18px 12px 12px",
        borderRadius: "var(--r-lg)",
        background: hov ? "var(--bg3)" : "var(--bg2)",
        border: `1px solid ${hov ? "rgba(124,58,237,0.22)" : "var(--border)"}`,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s, box-shadow 0.15s",
        boxShadow: hov ? "0 4px 20px rgba(124,58,237,0.1)" : "none",
        minHeight: 118,
        userSelect: "none",
      }}
    >
      <FolderSvg />

      {renaming ? (
        <RenameInput
          value={renameValue}
          onChange={onRenameChange}
          onCommit={onRenameCommit}
          onCancel={onRenameCancel}
        />
      ) : (
        <div style={{
          fontSize: 11, fontWeight: 500, color: "var(--text2)",
          textAlign: "center", lineHeight: 1.35, wordBreak: "break-word", width: "100%",
        }}>
          {folder.name}
        </div>
      )}

      {fileCount > 0 && (
        <div style={{ fontSize: 9, color: "var(--text4)" }}>
          {fileCount} Datei{fileCount !== 1 ? "en" : ""}
        </div>
      )}

      {hov && (
        <motion.div
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.12 }}
          style={{ position: "absolute", top: 6, right: 6, display: "flex", gap: 3 }}
        >
          <ActionBtn title="Umbenennen" onClick={(e) => { e.stopPropagation(); onRename(); }}>
            <PencilIcon />
          </ActionBtn>
          <ActionBtn title="Löschen" danger onClick={(e) => { e.stopPropagation(); onDelete(); }}>
            <TrashIcon />
          </ActionBtn>
        </motion.div>
      )}
    </motion.div>
  );
}

function FileCard({ file, index, onRename, onDelete, renaming, renameValue, onRenameChange, onRenameCommit, onRenameCancel }) {
  const [hov, setHov] = useState(false);
  const cat = CAT_META[fileCat(file.type, file.name)];
  const isImage = file.type?.startsWith("image/") && file.data;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.88 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.88 }}
      transition={{ duration: 0.2, delay: index * 0.025 }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position: "relative",
        padding: "12px",
        borderRadius: "var(--r-lg)",
        background: hov ? "var(--bg3)" : "var(--bg2)",
        border: `1px solid ${hov ? "var(--border2)" : "var(--border)"}`,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        cursor: "default",
        transition: "background 0.15s, border-color 0.15s",
        minHeight: 118,
        overflow: "hidden",
        userSelect: "none",
      }}
    >
      {isImage ? (
        <div style={{ width: 64, height: 48, borderRadius: 7, overflow: "hidden", background: "var(--bg4)", flexShrink: 0 }}>
          <img src={file.data} alt={file.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      ) : (
        <div style={{
          width: 48, height: 48, borderRadius: 12, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, background: cat.bg,
        }}>
          {cat.icon}
        </div>
      )}

      {renaming ? (
        <RenameInput
          value={renameValue}
          onChange={onRenameChange}
          onCommit={onRenameCommit}
          onCancel={onRenameCancel}
        />
      ) : (
        <div style={{
          fontSize: 11, fontWeight: 500, color: "var(--text2)",
          textAlign: "center", lineHeight: 1.35, wordBreak: "break-word", width: "100%",
        }}>
          {file.name}
        </div>
      )}

      {file.size > 0 && (
        <div style={{ fontSize: 9, color: "var(--text4)" }}>{fmtSize(file.size)}</div>
      )}

      {hov && (
        <motion.div
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.12 }}
          style={{ position: "absolute", top: 6, right: 6, display: "flex", gap: 3 }}
        >
          <ActionBtn title="Umbenennen" onClick={(e) => { e.stopPropagation(); onRename(); }}>
            <PencilIcon />
          </ActionBtn>
          {file.data && (
            <ActionBtn title="Öffnen" onClick={(e) => {
              e.stopPropagation();
              window.open(file.data, '_blank');
            }}>
              <EyeIcon />
            </ActionBtn>
          )}
          {file.data && (
            <ActionBtn title="Herunterladen" onClick={(e) => {
              e.stopPropagation();
              const a = document.createElement("a");
              a.href = file.data;
              a.download = file.name;
              a.click();
            }}>
              <DownloadIcon />
            </ActionBtn>
          )}
          <ActionBtn title="Löschen" danger onClick={(e) => { e.stopPropagation(); onDelete(); }}>
            <TrashIcon />
          </ActionBtn>
        </motion.div>
      )}
    </motion.div>
  );
}

function ListRow({ icon, name, meta, metaRight, renaming, renameValue, onRenameChange, onRenameCommit, onRenameCancel, onRename, onDelete, onDownload, onOpen, index }) {
  const [hov, setHov] = useState(false);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: 0.16, delay: index * 0.02 }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onDoubleClick={onOpen}
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "7px 10px",
        borderRadius: "var(--r-md)",
        background: hov ? "var(--bg2)" : "transparent",
        border: `1px solid ${hov ? "var(--border)" : "transparent"}`,
        marginBottom: 2, transition: "all 0.12s", cursor: onOpen ? "pointer" : "default",
        userSelect: "none",
      }}
    >
      <div style={{ width: 30, flexShrink: 0, display: "flex", justifyContent: "center" }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {renaming ? (
          <RenameInput value={renameValue} onChange={onRenameChange} onCommit={onRenameCommit} onCancel={onRenameCancel} />
        ) : (
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {name}
          </div>
        )}
        {meta && <div style={{ fontSize: 10, color: "var(--text4)", marginTop: 1 }}>{meta}</div>}
      </div>
      {metaRight && <div style={{ fontSize: 10, color: "var(--text4)", flexShrink: 0 }}>{metaRight}</div>}
      {hov && (
        <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
          <ActionBtn title="Umbenennen" onClick={(e) => { e.stopPropagation(); onRename(); }}><PencilIcon /></ActionBtn>
          {onOpen && <ActionBtn title="Öffnen" onClick={(e) => { e.stopPropagation(); onOpen(); }}><EyeIcon /></ActionBtn>}
          {onDownload && <ActionBtn title="Herunterladen" onClick={(e) => { e.stopPropagation(); onDownload(); }}><DownloadIcon /></ActionBtn>}
          <ActionBtn title="Löschen" danger onClick={(e) => { e.stopPropagation(); onDelete(); }}><TrashIcon /></ActionBtn>
        </div>
      )}
    </motion.div>
  );
}

function EmptyState({ onNewFolder, onUpload }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", height: "100%", minHeight: 280, gap: 14, padding: 40,
      }}
    >
      <div style={{
        width: 60, height: 60, borderRadius: 18,
        background: "rgba(124,58,237,0.08)",
        border: "1px solid rgba(124,58,237,0.18)",
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: "float 3s ease-in-out infinite",
      }}>
        <FolderSvg size={34} />
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text2)", marginBottom: 5 }}>Noch leer</div>
        <div style={{ fontSize: 12, color: "var(--text4)", lineHeight: 1.7 }}>
          Erstelle Ordner oder lade Dateien hoch.<br />
          Drag & Drop wird ebenfalls unterstützt.
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button
          onClick={onNewFolder}
          style={{
            padding: "7px 14px", borderRadius: "var(--r-md)",
            background: "var(--bg3)", border: "1px solid var(--border2)",
            color: "var(--text2)", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(124,58,237,0.35)"; e.currentTarget.style.color = "var(--p3)"; e.currentTarget.style.background = "var(--p5)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.color = "var(--text2)"; e.currentTarget.style.background = "var(--bg3)"; }}
        >
          + Neuer Ordner
        </button>
        <button
          onClick={onUpload}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 14px", borderRadius: "var(--r-md)",
            background: "var(--p)", border: "none",
            color: "#fff", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
            boxShadow: "0 0 20px rgba(124,58,237,0.3)",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--p2)"; e.currentTarget.style.boxShadow = "0 0 32px rgba(124,58,237,0.55)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--p)"; e.currentTarget.style.boxShadow = "0 0 20px rgba(124,58,237,0.3)"; }}
        >
          <UploadIcon /> Hochladen
        </button>
      </div>
    </motion.div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function AblagePane({ customerId }) {
  const folders = useStore((s) => s.folders.filter((f) => f.customerId === customerId));
  const uploadedFiles = useStore((s) => s.uploadedFiles.filter((f) => f.customerId === customerId));
  const addFolder = useStore((s) => s.addFolder);
  const renameFolder = useStore((s) => s.renameFolder);
  const deleteFolder = useStore((s) => s.deleteFolder);
  const addFile = useStore((s) => s.addFile);
  const renameFile = useStore((s) => s.renameFile);
  const deleteFile = useStore((s) => s.deleteFile);

  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [path, setPath] = useState([]); // [{ id, name }]
  const [viewMode, setViewMode] = useState("grid");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const currentFolders = folders.filter((f) => f.parentId === currentFolderId);
  const currentFiles = uploadedFiles.filter((f) => f.folderId === currentFolderId);
  const isEmpty = currentFolders.length === 0 && currentFiles.length === 0;

  const navigateInto = (folder) => {
    setCurrentFolderId(folder.id);
    setPath((p) => [...p, { id: folder.id, name: folder.name }]);
    setRenamingId(null);
  };

  const navigateTo = (id) => {
    if (id === null) {
      setCurrentFolderId(null);
      setPath([]);
    } else {
      const idx = path.findIndex((p) => p.id === id);
      setCurrentFolderId(id);
      setPath((p) => p.slice(0, idx + 1));
    }
    setRenamingId(null);
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    addFolder(customerId, currentFolderId, newFolderName.trim());
    setNewFolderName("");
    setNewFolderOpen(false);
    toast("Ordner erstellt ✓");
  };

  const handleUploadFiles = useCallback(
    (files) => {
      Array.from(files).forEach((file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            addFile(customerId, currentFolderId, {
              name: file.name,
              type: file.type,
              size: file.size,
              data: e.target.result,
            });
            toast(`${file.name} hochgeladen ✓`);
          } catch {
            toast("Speichern fehlgeschlagen – Datei zu groß?", "error");
          }
        };
        reader.readAsDataURL(file);
      });
    },
    [customerId, currentFolderId, addFile]
  );

  const handleFileInput = (e) => {
    if (e.target.files?.length) {
      handleUploadFiles(e.target.files);
      e.target.value = "";
    }
  };

  const startRename = (id, name) => {
    setRenamingId(id);
    setRenameValue(name);
  };
  const cancelRename = () => setRenamingId(null);
  const commitRename = () => {
    if (!renameValue.trim() || !renamingId) { setRenamingId(null); return; }
    const isFolder = folders.some((f) => f.id === renamingId);
    if (isFolder) renameFolder(renamingId, renameValue.trim());
    else renameFile(renamingId, renameValue.trim());
    setRenamingId(null);
    toast("Umbenannt ✓");
  };

  const commonRenameProps = (id, name) => ({
    renaming: renamingId === id,
    renameValue,
    onRenameChange: setRenameValue,
    onRenameCommit: commitRename,
    onRenameCancel: cancelRename,
    onRename: () => startRename(id, name),
  });

  return (
    <div
      style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) handleUploadFiles(e.dataTransfer.files); }}
    >
      {/* Drag overlay */}
      <AnimatePresence>
        {dragOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "absolute", inset: 0, zIndex: 50,
              background: "rgba(124,58,237,0.06)",
              border: "2px dashed rgba(124,58,237,0.4)",
              borderRadius: "var(--r-xl)",
              display: "flex", alignItems: "center", justifyContent: "center",
              backdropFilter: "blur(2px)",
              pointerEvents: "none",
            }}
          >
            <div style={{ fontSize: 13, color: "var(--p3)", fontWeight: 600, letterSpacing: "-0.01em" }}>
              Dateien hier ablegen
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toolbar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 20px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg1)",
        flexShrink: 0,
      }}>
        {/* Breadcrumb */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 3, minWidth: 0, overflow: "hidden" }}>
          <BreadcrumbBtn label="Ablage" onClick={() => navigateTo(null)} dim={path.length > 0} />
          {path.map((seg, i) => (
            <span key={seg.id} style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ color: "var(--text4)", display: "flex", alignItems: "center" }}><ChevronIcon /></span>
              <BreadcrumbBtn label={seg.name} onClick={() => navigateTo(seg.id)} dim={i < path.length - 1} />
            </span>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <button
            onClick={() => setNewFolderOpen(true)}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "5px 11px", borderRadius: "var(--r-md)",
              background: "var(--bg3)", border: "1px solid var(--border2)",
              color: "var(--text2)", fontSize: 11, fontWeight: 500, cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(124,58,237,0.35)"; e.currentTarget.style.color = "var(--p3)"; e.currentTarget.style.background = "var(--p5)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.color = "var(--text2)"; e.currentTarget.style.background = "var(--bg3)"; }}
          >
            <FolderPlusIcon /> Neuer Ordner
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "5px 11px", borderRadius: "var(--r-md)",
              background: "var(--p)", border: "none",
              color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer",
              transition: "all 0.15s",
              boxShadow: "0 0 18px rgba(124,58,237,0.3)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--p2)"; e.currentTarget.style.boxShadow = "0 0 30px rgba(124,58,237,0.55), 0 0 60px rgba(124,58,237,0.2)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--p)"; e.currentTarget.style.boxShadow = "0 0 18px rgba(124,58,237,0.3)"; }}
          >
            <UploadIcon /> Hochladen
          </button>

          <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={handleFileInput} />

          {/* View toggle */}
          <div style={{
            display: "flex", background: "var(--bg3)",
            border: "1px solid var(--border)", borderRadius: "var(--r-md)", overflow: "hidden",
          }}>
            {[["grid", <GridIcon />], ["list", <ListViewIcon />]].map(([v, icon]) => (
              <button
                key={v}
                onClick={() => setViewMode(v)}
                style={{
                  width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                  background: viewMode === v ? "var(--bg5)" : "transparent",
                  border: "none",
                  color: viewMode === v ? "var(--p3)" : "var(--text4)",
                  cursor: "pointer", transition: "all 0.12s",
                }}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        {isEmpty ? (
          <EmptyState onNewFolder={() => setNewFolderOpen(true)} onUpload={() => fileInputRef.current?.click()} />
        ) : viewMode === "grid" ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(124px, 1fr))", gap: 10 }}>
            <AnimatePresence initial={false}>
              {currentFolders.map((folder, i) => (
                <FolderCard
                  key={folder.id}
                  folder={folder}
                  fileCount={uploadedFiles.filter((f) => f.folderId === folder.id).length}
                  index={i}
                  onOpen={() => navigateInto(folder)}
                  onDelete={() => { deleteFolder(folder.id); toast("Ordner gelöscht"); }}
                  {...commonRenameProps(folder.id, folder.name)}
                />
              ))}
              {currentFiles.map((file, i) => (
                <FileCard
                  key={file.id}
                  file={file}
                  index={currentFolders.length + i}
                  onDelete={() => { deleteFile(file.id); toast("Datei gelöscht"); }}
                  {...commonRenameProps(file.id, file.name)}
                />
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div>
            {currentFolders.length > 0 && (
              <>
                <SectionLabel label="Ordner" count={currentFolders.length} />
                <AnimatePresence initial={false}>
                  {currentFolders.map((folder, i) => (
                    <ListRow
                      key={folder.id}
                      index={i}
                      icon={<FolderSvg size={22} />}
                      name={folder.name}
                      meta={(() => { const c = uploadedFiles.filter((f) => f.folderId === folder.id).length; return c > 0 ? `${c} Datei${c !== 1 ? "en" : ""}` : null; })()}
                      onOpen={() => navigateInto(folder)}
                      onDelete={() => { deleteFolder(folder.id); toast("Ordner gelöscht"); }}
                      {...commonRenameProps(folder.id, folder.name)}
                    />
                  ))}
                </AnimatePresence>
              </>
            )}
            {currentFiles.length > 0 && (
              <>
                <SectionLabel label="Dateien" count={currentFiles.length} />
                <AnimatePresence initial={false}>
                  {currentFiles.map((file, i) => {
                    const cat = CAT_META[fileCat(file.type, file.name)];
                    return (
                      <ListRow
                        key={file.id}
                        index={i}
                        icon={
                          <div style={{ width: 22, height: 22, borderRadius: 5, background: cat.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>
                            {cat.icon}
                          </div>
                        }
                        name={file.name}
                        meta={file.type || ""}
                        metaRight={fmtSize(file.size)}
                        onOpen={file.data ? () => window.open(file.data, '_blank') : null}
                        onDownload={file.data ? () => { const a = document.createElement("a"); a.href = file.data; a.download = file.name; a.click(); } : null}
                        onDelete={() => { deleteFile(file.id); toast("Datei gelöscht"); }}
                        {...commonRenameProps(file.id, file.name)}
                      />
                    );
                  })}
                </AnimatePresence>
              </>
            )}
          </div>
        )}
      </div>

      {/* New Folder Modal */}
      <Modal open={newFolderOpen} onClose={() => { setNewFolderOpen(false); setNewFolderName(""); }} title="Neuer Ordner">
        <input
          autoFocus
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder(); if (e.key === "Escape") { setNewFolderOpen(false); setNewFolderName(""); } }}
          placeholder="Ordnername…"
          style={{
            width: "100%", padding: "10px 12px", borderRadius: "var(--r-md)",
            background: "var(--bg4)", border: "1px solid var(--border2)", color: "var(--text)",
            fontSize: 13, fontFamily: "inherit", outline: "none", marginBottom: 14,
            transition: "border-color 0.15s",
          }}
          onFocus={(e) => (e.target.style.borderColor = "rgba(124,58,237,0.5)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--border2)")}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleCreateFolder}
            style={{
              flex: 1, padding: "9px 0", borderRadius: "var(--r-md)",
              background: "var(--p)", border: "none", color: "#fff",
              fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
              transition: "all 0.15s", boxShadow: "0 0 16px rgba(124,58,237,0.3)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--p2)"; e.currentTarget.style.boxShadow = "0 0 28px rgba(124,58,237,0.55)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--p)"; e.currentTarget.style.boxShadow = "0 0 16px rgba(124,58,237,0.3)"; }}
          >
            Erstellen
          </button>
          <button
            onClick={() => { setNewFolderOpen(false); setNewFolderName(""); }}
            style={{
              padding: "9px 16px", borderRadius: "var(--r-md)",
              background: "transparent", border: "1px solid var(--border2)",
              color: "var(--text3)", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--border3)"; e.currentTarget.style.color = "var(--text2)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.color = "var(--text3)"; }}
          >
            Abbrechen
          </button>
        </div>
      </Modal>
    </div>
  );
}

function BreadcrumbBtn({ label, onClick, dim }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 12, fontWeight: dim ? 400 : 600,
        color: dim ? "var(--text3)" : "var(--text)",
        background: "none", border: "none",
        cursor: dim ? "pointer" : "default",
        fontFamily: "inherit", padding: "2px 4px",
        borderRadius: "var(--r-sm)", transition: "color 0.12s",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120,
      }}
      onMouseEnter={(e) => { if (dim) e.currentTarget.style.color = "var(--text)"; }}
      onMouseLeave={(e) => { if (dim) e.currentTarget.style.color = "var(--text3)"; }}
    >
      {label}
    </button>
  );
}

function SectionLabel({ label, count }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
      textTransform: "uppercase", color: "var(--text4)",
      padding: "4px 10px 6px", marginTop: 4,
    }}>
      {label} {count > 0 && `· ${count}`}
    </div>
  );
}
