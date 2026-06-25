import iconDirectory from '../assets/icons/icon-directory.svg'
import iconFile from '../assets/icons/icon-file.svg'

const ICON_CLASS = 'w-4 h-4 inline-block align-text-bottom shrink-0'

interface RepoTreeIconProps {
  isDirectory: boolean
}

export function RepoTreeIcon({ isDirectory }: RepoTreeIconProps) {
  return (
    <img
      src={isDirectory ? iconDirectory : iconFile}
      alt=""
      aria-hidden
      className={ICON_CLASS}
    />
  )
}
