import { useState, useRef, useEffect } from 'react';
import { X, UploadCloud, Music, Folder, Image as ImageIcon, CheckCircle, Loader, Layers } from 'lucide-react';
import jsmediatags from 'jsmediatags/dist/jsmediatags.min.js';
import './UploadModal.css';
import { uploadSongToCloud } from '../../services/supabase';

const parseId3Tag = (file) => {
  return Promise.race([
    new Promise((resolve) => {
      try {
        jsmediatags.read(file, {
          onSuccess: function (tag) {
            let coverBlob = null;
            if (tag.tags && tag.tags.picture) {
              const { data, format } = tag.tags.picture;
              const byteArray = new Uint8Array(data);
              coverBlob = new Blob([byteArray], { type: format });
            }
            resolve({
              title: tag.tags?.title,
              artist: tag.tags?.artist,
              album: tag.tags?.album,
              genre: tag.tags?.genre,
              coverBlob
            });
          },
          onError: function () {
            resolve(null);
          }
        });
      } catch {
        resolve(null);
      }
    }),
    new Promise((resolve) => setTimeout(() => resolve(null), 1500))
  ]);
};

export default function UploadModal({ isOpen, onClose, onUploadSuccess, isCloudConfigured, uploaderName }) {
  // Tabs: 'song' or 'folder'
  const [activeTab, setActiveTab] = useState('song');
  const [shareToCloud, setShareToCloud] = useState(false);
  
  // --- SINGLE SONG STATES ---
  const [file, setFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState('');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [genre, setGenre] = useState('');
  const [duration, setDuration] = useState(0);

  // --- FOLDER SELECTION STATES ---
  const [folderFiles, setFolderFiles] = useState([]);
  const [folderImages, setFolderImages] = useState({}); // Stores mapping of directory paths to their cover Image files
  const [folderName, setFolderName] = useState('');
  const [folderArtist, setFolderArtist] = useState('Local Folder Upload');
  const [folderGenre, setFolderGenre] = useState('');

  // --- GLOBAL STATES ---
  const [isDragging, setIsDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const coverInputRef = useRef(null);

  // Cleanup preview URL on unmount or change
  useEffect(() => {
    return () => {
      if (coverPreview && coverPreview.startsWith('blob:')) {
        URL.revokeObjectURL(coverPreview);
      }
    };
  }, [coverPreview]);

  if (!isOpen) return null;

  // --- SINGLE FILE METADATA PARSER ---
  const processAudioFile = async (selectedFile) => {
    if (!selectedFile) return;

    const isAudio = selectedFile.type.startsWith('audio/') || /\.(mp3|wav|m4a|flac|ogg|aac|webm)$/i.test(selectedFile.name);
    if (!isAudio) {
      alert('Please upload a valid audio file (MP3, WAV, M4A, FLAC, OGG).');
      return;
    }

    if (selectedFile.size > 100 * 1024 * 1024) {
      alert('Selected audio file exceeds 100MB limit. Please choose a smaller file.');
      return;
    }

    setFile(selectedFile);

    const cleanTitle = selectedFile.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
    
    // Attempt ID3 parsing
    const tags = await parseId3Tag(selectedFile);
    if (tags) {
      setTitle(tags.title || cleanTitle);
      setArtist(tags.artist || 'My Local Upload');
      setAlbum(tags.album || 'Single');
      if (tags.genre) setGenre(tags.genre);
      if (tags.coverBlob) {
        setCoverFile(tags.coverBlob);
        setCoverPreview(prev => {
          if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
          return URL.createObjectURL(tags.coverBlob);
        });
      }
    } else {
      setTitle(cleanTitle);
      setArtist('My Local Upload');
      setAlbum('Single');
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    const tempAudio = new Audio(objectUrl);
    const cleanupAudio = () => {
      URL.revokeObjectURL(objectUrl);
      tempAudio.removeEventListener('loadedmetadata', handleLoaded);
      tempAudio.removeEventListener('error', handleError);
    };
    const handleLoaded = () => {
      setDuration(tempAudio.duration || 180);
      cleanupAudio();
    };
    const handleError = () => {
      setDuration(180);
      cleanupAudio();
    };
    tempAudio.addEventListener('loadedmetadata', handleLoaded);
    tempAudio.addEventListener('error', handleError);
  };

  // --- BULK FOLDER SELECTION PARSER ---
  const handleFolderSelect = (e) => {
    const rawFiles = Array.from(e.target.files);
    
    // Filter audio files (case-insensitive)
    const audioFiles = rawFiles.filter(
      (f) => f.type.startsWith('audio/') || /\.(mp3|wav|m4a|flac|ogg|aac|webm)$/i.test(f.name)
    );

    // Extract all image files to look for cover art
    const imageFiles = rawFiles.filter(
      (f) => f.type.startsWith('image/') || f.name.endsWith('.jpg') || f.name.endsWith('.png') || f.name.endsWith('.jpeg')
    );

    if (audioFiles.length === 0) {
      alert('No valid MP3 or audio files found in the selected folder.');
      return;
    }

    // Map images by their parent directory path
    const imagesByDir = {};
    const possibleCoverNames = ['cover.jpg', 'cover.png', 'folder.jpg', 'folder.png', 'albumart.jpg'];
    
    imageFiles.forEach(img => {
      const parts = img.webkitRelativePath.split('/');
      parts.pop(); // Remove file name to get directory path
      const dirPath = parts.join('/');
      const imgNameLower = img.name.toLowerCase();
      
      // If we don't have a cover for this dir yet, or if this image strongly matches a cover name
      if (!imagesByDir[dirPath] || possibleCoverNames.includes(imgNameLower)) {
        imagesByDir[dirPath] = img;
      }
    });

    // Extract root directory name from webkitRelativePath
    let dirName = 'Music Folder';
    if (audioFiles[0].webkitRelativePath) {
      dirName = audioFiles[0].webkitRelativePath.split('/')[0];
    }

    setFolderFiles(audioFiles);
    setFolderImages(imagesByDir);
    setFolderName(dirName);
    setFolderArtist(dirName); // Default artist to directory name
  };

  const processCoverFile = (selectedCover) => {
    if (!selectedCover) return;
    if (!selectedCover.type.startsWith('image/')) {
      alert('Please select an image file (PNG/JPG).');
      return;
    }
    if (selectedCover.size > 10 * 1024 * 1024) {
      alert('Cover image exceeds 10MB limit. Please choose a smaller image.');
      return;
    }
    setCoverFile(selectedCover);
    setCoverPreview(prev => {
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return URL.createObjectURL(selectedCover);
    });
  };

  // Drag and Drop hooks (Single Song Only)
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (activeTab === 'song' && e.dataTransfer.files && e.dataTransfer.files[0]) {
      processAudioFile(e.dataTransfer.files[0]);
    }
  };

  // --- SUBMIT SAVE (SINGLE & BULK DIRECTORIES) ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    const timeNow = new Date().getTime();

    try {
      if (activeTab === 'song') {
        // --- Single song save ---
        if (!file) return;
        
        let songData;
        const cleanTitle = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");

        if (shareToCloud) {
          setSaveProgress('Uploading audio file to cloud storage...');
          // Call Supabase upload service
          const cloudMeta = await uploadSongToCloud(
            title.trim() || cleanTitle || 'Untitled Song',
            artist.trim() || 'My Local Upload',
            album.trim() || 'Single',
            genre.trim() || 'Electronic',
            file,
            coverFile || null,
            uploaderName
          );

          songData = {
            id: cloudMeta.id,
            title: cloudMeta.title,
            artist: cloudMeta.artist,
            album: cloudMeta.album,
            genre: cloudMeta.genre,
            duration: duration || 180,
            url: cloudMeta.url,
            coverUrl: cloudMeta.coverUrl,
            isUserUpload: true,
            isCloud: true,
            uploader: cloudMeta.uploader,
            addedAt: timeNow
          };

          // Cache reference in IndexedDB
          await onUploadSuccess(songData);
        } else {
          songData = {
            id: timeNow.toString(),
            title: title.trim() || cleanTitle || 'Untitled Song',
            artist: artist.trim() || 'My Local Upload',
            album: album.trim() || 'Single',
            genre: genre.trim() || 'Electronic',
            duration: duration || 180, // Default to 3:00 if length loading fails
            audioBlob: file,
            coverBlob: coverFile || null,
            isUserUpload: true,
            addedAt: timeNow
          };
          await onUploadSuccess(songData);
        }
      } else {
        // --- Bulk Folder Save ---
        if (folderFiles.length === 0) return;

        const songsToSave = [];
        for (let i = 0; i < folderFiles.length; i++) {
          const currentFile = folderFiles[i];
          setSaveProgress(`Processing track ${i + 1} of ${folderFiles.length}...`);

          const cleanTitle = currentFile.name
            .replace(/\.[^/.]+$/, '')
            .replace(/[_-]/g, ' ');

          // Parse ID3 tags for bulk files
          const tags = await parseId3Tag(currentFile);
          
          // Determine parent directory path to check for fallback images
          const pathParts = currentFile.webkitRelativePath.split('/');
          pathParts.pop(); // Remove filename
          const dirPath = pathParts.join('/');
          const siblingImage = folderImages[dirPath];
          
          let finalCoverBlob = null;
          if (tags && tags.coverBlob) {
            finalCoverBlob = tags.coverBlob; // 1. Embedded ID3 Art
          } else if (siblingImage) {
            finalCoverBlob = siblingImage; // 2. Sibling directory cover.jpg
          }
          
          songsToSave.push({
            id: `folder-${timeNow}-${i}`,
            title: tags?.title || cleanTitle,
            artist: tags?.artist || folderArtist.trim() || folderName || 'Local Folder Upload',
            album: tags?.album || folderName || 'Local Album',
            genre: tags?.genre || folderGenre.trim() || 'Electronic',
            duration: 180, // Browser sequential metadata parsing of 50+ files is heavy, so we default to 3 mins
            audioBlob: currentFile,
            coverBlob: finalCoverBlob,
            isUserUpload: true,
            addedAt: timeNow
          });
        }

        setSaveProgress(`Saving ${songsToSave.length} tracks to library...`);
        await onUploadSuccess(songsToSave);
      }

      setIsSuccess(true);
      setTimeout(() => {
        resetForm();
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Error saving song:', err);
      alert('Failed to save music: ' + (err.message || err));
    } finally {
      setIsSaving(false);
      setSaveProgress('');
    }
  };

  const resetForm = () => {
    setCoverPreview(prev => {
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return '';
    });
    setFile(null);
    setCoverFile(null);
    setTitle('');
    setArtist('');
    setAlbum('');
    setGenre('');
    setDuration(0);
    setFolderFiles([]);
    setFolderImages({});
    setFolderName('');
    setFolderArtist('Local Folder Upload');
    setFolderGenre('');
    setIsSuccess(false);
  };

  return (
    <div className="modal-backdrop animate-fade-in" onClick={onClose}>
      <div className="modal-content glass-panel animate-slide-in" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="modal-header">
          <h2 className="text-gradient-purple">Add Music Library</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        {/* Dynamic Navigation Tabs (Song vs Folder selector) */}
        {!isSuccess && !file && folderFiles.length === 0 && (
          <div className="modal-tabs">
            <button 
              type="button" 
              className={`modal-tab ${activeTab === 'song' ? 'active' : ''}`}
              onClick={() => setActiveTab('song')}
            >
              <Music size={16} />
              <span>Single Song</span>
            </button>
            <button 
              type="button" 
              className={`modal-tab ${activeTab === 'folder' ? 'active' : ''}`}
              onClick={() => setActiveTab('folder')}
            >
              <Folder size={16} />
              <span>Select Entire Folder</span>
            </button>
          </div>
        )}

        {/* Content Body */}
        {isSuccess ? (
          <div className="success-container animate-fade-in">
            <CheckCircle size={64} className="success-icon" />
            <h3>Import Successful!</h3>
            <p>
              {activeTab === 'song' 
                ? 'Your song has been successfully added to your offline local library.'
                : `Successfully imported ${folderFiles.length} songs from folder "${folderName}"!`}
            </p>
          </div>
        ) : (
          <form className="modal-form" onSubmit={handleSubmit}>
            
            {/* TABS 1: SINGLE SONG CHOOSE VIEW */}
            {activeTab === 'song' && (
              <>
                {!file ? (
                  <div 
                    className={`dropzone ${isDragging ? 'dragging' : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current.click()}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      accept="audio/mp3,audio/*" 
                      onChange={(e) => processAudioFile(e.target.files[0])} 
                      style={{ display: 'none' }}
                    />
                    <UploadCloud size={48} className="dropzone-icon" />
                    <h3>Drag & Drop your MP3 file here</h3>
                    <p>or click to browse local files</p>
                    <span className="file-info-limit">Supports standard audio MP3 files</span>
                  </div>
                ) : (
                  <div className="uploaded-file-banner">
                    <Music size={24} className="text-primary" />
                    <div className="file-summary">
                      <span className="file-name truncate">{file.name}</span>
                      <span className="file-size">{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                    </div>
                    <button type="button" className="btn-remove-file" onClick={() => setFile(null)}>Change</button>
                  </div>
                )}

                {file && (
                  <div className="form-grid animate-fade-in">
                    <div className="cover-uploader-block">
                      <div 
                        className="cover-preview-box" 
                        onClick={() => coverInputRef.current.click()}
                        style={{ background: coverPreview ? 'none' : 'rgba(255,255,255,0.03)' }}
                      >
                        {coverPreview ? (
                          <img src={coverPreview} alt="Cover Preview" className="cover-preview-img" />
                        ) : (
                          <div className="cover-placeholder">
                            <ImageIcon size={32} className="cover-icon" />
                            <span>Add Cover Art</span>
                          </div>
                        )}
                      </div>
                      <input 
                        type="file" 
                        ref={coverInputRef} 
                        accept="image/*" 
                        onChange={(e) => processCoverFile(e.target.files[0])} 
                        style={{ display: 'none' }}
                      />
                    </div>

                    <div className="metadata-fields">
                      <div className="input-group">
                        <label>Song Title</label>
                        <input 
                          type="text" 
                          value={title} 
                          onChange={(e) => setTitle(e.target.value)} 
                          placeholder="e.g. 417 (Optional)"
                        />
                      </div>

                      <div className="input-row">
                        <div className="input-group">
                          <label>Artist Name</label>
                          <input 
                            type="text" 
                            value={artist} 
                            onChange={(e) => setArtist(e.target.value)} 
                            placeholder="e.g. sean appall (Optional)"
                          />
                        </div>
                        <div className="input-group">
                          <label>Album Name</label>
                          <input 
                            type="text" 
                            value={album} 
                            onChange={(e) => setAlbum(e.target.value)} 
                            placeholder="e.g. Album Name (Optional)"
                          />
                        </div>
                      </div>

                      <div className="input-group">
                        <label>Genre / Category</label>
                        <input 
                          type="text" 
                          value={genre} 
                          onChange={(e) => setGenre(e.target.value)} 
                          placeholder="e.g. Punjabi, Phonk, Remix (Optional)"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* TABS 2: SELECT ENTIRE FOLDER VIEW (BULK) */}
            {activeTab === 'folder' && (
              <>
                {folderFiles.length === 0 ? (
                  <div 
                    className="dropzone folder-drop"
                    onClick={() => folderInputRef.current.click()}
                  >
                    <input 
                      type="file" 
                      ref={folderInputRef} 
                      webkitdirectory=""
                      directory=""
                      multiple
                      style={{ display: 'none' }}
                      onChange={handleFolderSelect}
                    />
                    <Layers size={48} className="dropzone-icon text-accent" />
                    <h3>Click to Select an Entire Music Folder</h3>
                    <p>It will scan all MP3 and audio songs inside the folder instantly!</p>
                    <span className="file-info-limit">Works on Google Chrome, Edge, Safari, and Firefox</span>
                  </div>
                ) : (
                  <div className="uploaded-file-banner folder-success">
                    <Folder size={24} className="text-accent" />
                    <div className="file-summary">
                      <span className="file-name truncate">Folder: "{folderName}"</span>
                      <span className="file-size">{folderFiles.length} MP3 tracks detected</span>
                    </div>
                    <button type="button" className="btn-remove-file" onClick={() => setFolderFiles([])}>Change Folder</button>
                  </div>
                )}

                {folderFiles.length > 0 && (
                  <div className="metadata-fields animate-fade-in">
                    <div className="input-row">
                      <div className="input-group">
                        <label>Assign Artist (All Songs)</label>
                        <input 
                          type="text" 
                          value={folderArtist} 
                          onChange={(e) => setFolderArtist(e.target.value)} 
                          placeholder="e.g. Local Folder Upload (Optional)"
                        />
                      </div>
                      <div className="input-group">
                        <label>Assign Genre / Category (All Songs)</label>
                        <input 
                          type="text" 
                          value={folderGenre} 
                          onChange={(e) => setFolderGenre(e.target.value)} 
                          placeholder="e.g. Punjabi, Phonk, Remix (Optional)"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Share to Cloud Toggle (Only if Supabase is configured & active song tab has a file selected) */}
            {isCloudConfigured && activeTab === 'song' && file && (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '10px', 
                margin: '12px 0 6px 0',
                padding: '10px 14px',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px dashed var(--glass-border)',
                borderRadius: '12px'
              }}>
                <input 
                  type="checkbox" 
                  id="shareToCloudCheckbox"
                  checked={shareToCloud} 
                  onChange={(e) => setShareToCloud(e.target.checked)}
                  style={{ width: '15px', height: '15px', accentColor: 'var(--secondary)', cursor: 'pointer' }}
                />
                <label htmlFor="shareToCloudCheckbox" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-main)', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}>
                  <span>🌐 Share with the world (Upload to Cloud)</span>
                  <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 400 }}>Anyone using this website will be able to stream this song!</span>
                </label>
              </div>
            )}

            {/* Actions Footer */}
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={isSaving}>Cancel</button>
              
              <button 
                type="submit" 
                className="btn-primary" 
                disabled={(activeTab === 'song' ? !file : folderFiles.length === 0) || isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader size={18} className="spin-animate" />
                    <span>{saveProgress || 'Saving...'}</span>
                  </>
                ) : (
                  activeTab === 'song' ? 'Save & Share Song' : 'Import Entire Folder'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
