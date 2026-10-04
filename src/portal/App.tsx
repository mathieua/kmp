import { Routes, Route } from 'react-router-dom'
import { PortalLayout } from './components/layout/PortalLayout'
import { LibraryPage } from './pages/LibraryPage'
import { ImportPage } from './pages/ImportPage'
import { UploadPage } from './pages/UploadPage'
import { SyncPage } from './pages/SyncPage'
import { UpdatesPage } from './pages/UpdatesPage'

export function App() {
  return (
    <Routes>
      <Route path="/portal" element={<PortalLayout />}>
        <Route index element={<LibraryPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="upload" element={<UploadPage />} />
        <Route path="sync" element={<SyncPage />} />
        <Route path="updates" element={<UpdatesPage />} />
      </Route>
    </Routes>
  )
}
