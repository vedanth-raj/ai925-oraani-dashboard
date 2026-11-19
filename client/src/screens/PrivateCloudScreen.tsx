import React, { useEffect, useState, useRef } from 'react';
import { 
  ArrowLeft, FolderPlus, Upload, Folder, File, Trash2, 
  Download, Edit2, ChevronRight, Loader2, HardDrive, RefreshCw, X, AlertCircle 
} from 'lucide-react';
import { api } from '../api';
import { compressImage } from '../utils/imageCompressor';

interface PrivateCloudScreenProps {
  onBack: () => void;
}

interface CloudFolder {
  id: string;
  name: string;
  parent_id: string | null;
  file_count?: number;
  subfolder_count?: number;
  created_at: string;
}

interface CloudFile {
  id: string;
  folder_id: string | null;
  filename: string;
  original_name: string;
  file_size: number;
  mime_type: string;
  uploaded_by_name?: string;
  created_at: string;
}

export const PrivateCloudScreen: React.FC<PrivateCloudScreenProps> = ({ onBack }) => {
  const [folderStack, setFolderStack] = useState<{ id: string | null; name: string }[]>([
    { id: null, name: 'Cloud Drive' }
  ]);
  const currentFolder = folderStack[folderStack.length - 1];

  const [folders, setFolders] = useState<CloudFolder[]>([]);
  const [files, setFiles] = useState<CloudFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // New Folder Modal
  const [newFolderModalOpen, setNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);

  // Rename Folder Modal
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [folderToRename, setFolderToRename] = useState<CloudFolder | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchContents = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const [foldersRes, filesRes] = await Promise.all([
        api.getCloudFolders(currentFolder.id),
        api.getCloudFiles(currentFolder.id)
      ]);
      setFolders(foldersRes.folders || []);
      setFiles(filesRes.files || []);
    } catch (err: any) {
      console.error('Failed to load cloud drive contents:', err);
      setLoadError(err.message || 'Failed to load cloud drive contents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContents();
  }, [currentFolder.id]);

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      setCreatingFolder(true);
      await api.createCloudFolder({
        name: newFolderName.trim(),
        parent_id: currentFolder.id
      });
      setNewFolderName('');
      setNewFolderModalOpen(false);
      fetchContents();
    } catch (err: any) {
      alert(err.message || 'Failed to create folder');
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleRenameFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderToRename || !renameValue.trim()) return;

    try {
      await api.renameCloudFolder(folderToRename.id, renameValue.trim());
      setRenameModalOpen(false);
      setFolderToRename(null);
      fetchContents();
    } catch (err: any) {
      alert(err.message || 'Failed to rename folder');
    }
  };

  const handleDeleteFolder = async (folder: CloudFolder) => {
    if (!confirm(`Are you sure you want to delete folder "${folder.name}" and all of its files?`)) {
      return;
    }
    try {
      await api.deleteCloudFolder(folder.id);
      fetchContents();
    } catch (err: any) {
      alert(err.message || 'Failed to delete folder');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    try {
      setUploading(true);
      // Automatically compress if it's an image
      const processedFile = await compressImage(selectedFile);

      const formData = new FormData();
      formData.append('file', processedFile);
      if (currentFolder.id) {
        formData.append('folder_id', currentFolder.id);
      }

      await api.uploadCloudFile(formData);
      fetchContents();
    } catch (err: any) {
      alert(err.message || 'Failed to upload file');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteFile = async (file: CloudFile) => {
    if (!confirm(`Delete file "${file.original_name}"?`)) return;
    try {
      await api.deleteCloudFile(file.id);
      fetchContents();
    } catch (err: any) {
      alert(err.message || 'Failed to delete file');
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  return (
    <div className="pb-28 pt-4 px-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (folderStack.length > 1) {
                setFolderStack(prev => prev.slice(0, prev.length - 1));
              } else {
                onBack();
              }
            }}
            className="w-10 h-10 rounded-full bg-[#FFFCF7] border border-[#D2BFA7] flex items-center justify-center text-[#2F2923] hover:bg-[#E8DCCB] transition-colors cursor-pointer"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-1.5">
              <HardDrive size={18} className="text-[#6B5744]" />
              <h1 className="text-xl font-bold text-[#2F2923]">Private Cloud</h1>
            </div>
            <p className="text-xs text-[#766B60]">Secure encrypted organization storage</p>
          </div>
        </div>

        <button
          onClick={fetchContents}
          title="Refresh contents"
          className="p-2 text-[#766B60] hover:text-[#2F2923] hover:bg-[#E8DCCB]/40 rounded-full transition-colors cursor-pointer"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Breadcrumb Path */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3 text-xs font-semibold text-[#766B60]">
        {folderStack.map((f, idx) => {
          const isLast = idx === folderStack.length - 1;
          return (
            <React.Fragment key={idx}>
              {idx > 0 && <ChevronRight size={14} className="text-[#B49A7A] shrink-0" />}
              <button
                onClick={() => setFolderStack(prev => prev.slice(0, idx + 1))}
                className={`whitespace-nowrap px-2 py-1 rounded-md transition-colors cursor-pointer ${
                  isLast
                    ? 'bg-[#E8DCCB] text-[#2F2923] font-bold'
                    : 'hover:bg-[#E8DCCB]/50 text-[#6B5744]'
                }`}
              >
                {f.name}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* Error Alert */}
      {loadError && (
        <div className="bg-[#FBE9E9] border border-[#E8B4B4] rounded-xl p-3.5 mb-4 flex items-center justify-between text-[#C94C4C] text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{loadError}</span>
          </div>
          <button
            onClick={fetchContents}
            className="px-2.5 py-1 bg-white border border-[#E8B4B4] rounded-lg font-bold text-[11px] hover:bg-[#FBE9E9] cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Action Toolbar */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <button
          onClick={() => {
            setNewFolderName('');
            setNewFolderModalOpen(true);
          }}
          className="flex items-center justify-center gap-2 py-2.5 px-3 bg-[#FFFCF7] border border-[#D2BFA7] hover:border-[#6B5744] active:bg-[#E8DCCB] text-[#2F2923] text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
        >
          <FolderPlus size={16} className="text-[#6B5744]" />
          <span>New Folder</span>
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center justify-center gap-2 py-2.5 px-3 bg-[#6B5744] hover:bg-[#584534] active:bg-[#473B32] text-white text-xs font-bold rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer"
        >
          {uploading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Uploading...</span>
            </>
          ) : (
            <>
              <Upload size={16} />
              <span>Upload File</span>
            </>
          )}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-3 border-[#6B5744] border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : folders.length === 0 && files.length === 0 ? (
        <div className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-10 text-center shadow-xs">
          <Folder size={40} className="mx-auto text-[#B49A7A] opacity-50 mb-2" />
          <h3 className="font-bold text-sm text-[#2F2923]">This folder is empty</h3>
          <p className="text-xs text-[#766B60] mt-1 max-w-xs mx-auto">
            Create a folder or upload documents, invoices, order specs, or contracts.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Folders List */}
          {folders.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-[#766B60] uppercase tracking-wider mb-2">
                Folders ({folders.length})
              </p>
              <div className="grid grid-cols-1 gap-2">
                {folders.map(f => (
                  <div
                    key={f.id}
                    className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-3 shadow-xs flex items-center justify-between hover:border-[#6B5744] transition-all"
                  >
                    <div
                      onClick={() => setFolderStack(prev => [...prev, { id: f.id, name: f.name }])}
                      className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                    >
                      <div className="w-9 h-9 rounded-lg bg-[#E8DCCB] text-[#6B5744] flex items-center justify-center shrink-0">
                        <Folder size={20} />
                      </div>
                      <div className="truncate">
                        <h4 className="font-bold text-sm text-[#2F2923] truncate">{f.name}</h4>
                        <p className="text-[11px] text-[#766B60]">
                          {f.file_count || 0} files · {f.subfolder_count || 0} subfolders
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <button
                        onClick={() => {
                          setFolderToRename(f);
                          setRenameValue(f.name);
                          setRenameModalOpen(true);
                        }}
                        className="p-1.5 text-[#766B60] hover:text-[#2F2923] rounded-lg transition-colors cursor-pointer"
                        title="Rename folder"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => handleDeleteFolder(f)}
                        className="p-1.5 text-[#C94C4C] hover:bg-[#FBE9E9] rounded-lg transition-colors cursor-pointer"
                        title="Delete folder"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Files List */}
          {files.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-[#766B60] uppercase tracking-wider mb-2">
                Files ({files.length})
              </p>
              <div className="space-y-2">
                {files.map(file => (
                  <div
                    key={file.id}
                    className="bg-[#FFFCF7] border border-[#D2BFA7] rounded-xl p-3 shadow-xs flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-[#F5F0E8] text-[#6B5744] flex items-center justify-center shrink-0 border border-[#E8DCCB]">
                        <File size={18} />
                      </div>
                      <div className="truncate">
                        <h4 className="font-bold text-xs text-[#2F2923] truncate" title={file.original_name}>
                          {file.original_name}
                        </h4>
                        <p className="text-[10px] text-[#766B60]">
                          {formatBytes(file.file_size)} · {new Date(file.created_at).toLocaleDateString()}
                          {file.uploaded_by_name && ` · ${file.uploaded_by_name}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <button
                        onClick={async () => {
                          try {
                            await api.downloadCloudFile(file.id, file.original_name);
                          } catch (err: any) {
                            alert(err.message || 'Failed to download file');
                          }
                        }}
                        className="p-2 text-[#6B5744] hover:bg-[#E8DCCB] rounded-lg transition-colors cursor-pointer"
                        title="Download file"
                      >
                        <Download size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteFile(file)}
                        className="p-2 text-[#C94C4C] hover:bg-[#FBE9E9] rounded-lg transition-colors cursor-pointer"
                        title="Delete file"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* New Folder Modal */}
      {newFolderModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-5 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-base text-[#2F2923]">Create New Folder</h3>
              <button
                onClick={() => setNewFolderModalOpen(false)}
                className="p-1 text-[#766B60] hover:text-[#2F2923] rounded-lg"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateFolder}>
              <input
                type="text"
                autoFocus
                required
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder Name (e.g. Invoices 2026)"
                className="w-full px-3 py-2.5 bg-[#F5F0E8]/50 border border-[#D2BFA7] rounded-xl text-sm text-[#2F2923] focus:bg-[#FFFCF7] focus:outline-none focus:ring-2 focus:ring-[#6B5744]/30 focus:border-[#6B5744] mb-4"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setNewFolderModalOpen(false)}
                  className="flex-1 py-2 bg-[#F5F0E8] border border-[#D2BFA7] text-[#2F2923] text-xs font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingFolder || !newFolderName.trim()}
                  className="flex-1 py-2 bg-[#6B5744] text-white text-xs font-semibold rounded-xl hover:bg-[#584534] disabled:opacity-50"
                >
                  {creatingFolder ? 'Creating...' : 'Create Folder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rename Folder Modal */}
      {renameModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#FFFCF7] border border-[#D2BFA7] rounded-2xl p-5 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-base text-[#2F2923]">Rename Folder</h3>
              <button
                onClick={() => setRenameModalOpen(false)}
                className="p-1 text-[#766B60] hover:text-[#2F2923] rounded-lg"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleRenameFolder}>
              <input
                type="text"
                autoFocus
                required
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="Folder Name"
                className="w-full px-3 py-2.5 bg-[#F5F0E8]/50 border border-[#D2BFA7] rounded-xl text-sm text-[#2F2923] focus:bg-[#FFFCF7] focus:outline-none focus:ring-2 focus:ring-[#6B5744]/30 focus:border-[#6B5744] mb-4"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRenameModalOpen(false)}
                  className="flex-1 py-2 bg-[#F5F0E8] border border-[#D2BFA7] text-[#2F2923] text-xs font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!renameValue.trim()}
                  className="flex-1 py-2 bg-[#6B5744] text-white text-xs font-semibold rounded-xl hover:bg-[#584534] disabled:opacity-50"
                >
                  Rename
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
