import { useState } from 'react';
import useTheme from '@srcbook/components/src/components/use-theme';

import {
  ChevronsLeftIcon,
  FlagIcon,
  FolderTreeIcon,
  KeyboardIcon,
  MoonIcon,
  PackageIcon,
  SunIcon,
} from 'lucide-react';
import { Button } from '@srcbook/components/src/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@srcbook/components/src/components/ui/tooltip';
import KeyboardShortcutsDialog from '../keyboard-shortcuts-dialog';
import FeedbackDialog from '../feedback-dialog';
import { cn } from '@/lib/utils';
import ExplorerPanel from './panels/explorer';
import PackagesPanel from './panels/settings';
import { usePackageJson } from './use-package-json';

export type PanelType = 'explorer' | 'packages';

function getTitleForPanel(panel: PanelType | null): string | null {
  switch (panel) {
    case 'explorer':
      return 'Files';
    case 'packages':
      return 'Manage Packages';
    default:
      return null;
  }
}

type SidebarProps = {
  initialPanel: PanelType | null;
};

export default function Sidebar({ initialPanel }: SidebarProps) {
  const { theme, toggleTheme } = useTheme();

  const { status } = usePackageJson();
  const [panel, _setPanel] = useState<PanelType | null>(initialPanel);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  function setPanel(nextPanel: PanelType) {
    _setPanel(nextPanel === panel ? null : nextPanel);
  }

  return (
    <>
      <KeyboardShortcutsDialog open={showShortcuts} onOpenChange={setShowShortcuts} />
      <FeedbackDialog open={showFeedback} onOpenChange={setShowFeedback} />

      <div className="flex h-full border-r border-border">
        <div className="flex flex-col items-center justify-between w-12 h-full py-3 bg-muted z-10">
          <div className="flex flex-col items-center w-full gap-2">
            <NavItemWithTooltip tooltipContent="Explorer" onClick={() => setPanel('explorer')}>
              <FolderTreeIcon
                size={18}
                className={cn(
                  'transition-colors',
                  panel === 'explorer'
                    ? 'text-secondary-foreground'
                    : 'text-tertiary-foreground hover:text-secondary-foreground',
                )}
              />
            </NavItemWithTooltip>
            <NavItemWithTooltip tooltipContent="Packages" onClick={() => setPanel('packages')}>
              <PackageIcon
                size={18}
                className={cn(
                  'transition-colors',
                  panel === 'packages'
                    ? 'text-secondary-foreground'
                    : 'text-tertiary-foreground hover:text-secondary-foreground',
                  status === 'installing' && 'text-run',
                  status === 'failed' && 'text-error',
                )}
              />
            </NavItemWithTooltip>
          </div>
          <div className="flex flex-col items-center w-full gap-2">
            <NavItemWithTooltip
              tooltipContent={theme === 'light' ? 'Dark mode' : 'Light mode'}
              onClick={toggleTheme}
            >
              {theme === 'light' ? (
                <MoonIcon
                  size={18}
                  className="text-tertiary-foreground hover:text-secondary-foreground transition-colors"
                />
              ) : (
                <SunIcon
                  size={18}
                  className="text-tertiary-foreground hover:text-secondary-foreground transition-colors"
                />
              )}
            </NavItemWithTooltip>
            <NavItemWithTooltip
              tooltipContent="Keyboard shortcuts"
              onClick={() => setShowShortcuts(true)}
            >
              <KeyboardIcon
                size={18}
                className="text-tertiary-foreground hover:text-secondary-foreground transition-colors"
              />
            </NavItemWithTooltip>
            <NavItemWithTooltip
              tooltipContent="Leave feedback"
              onClick={() => setShowFeedback(true)}
            >
              <FlagIcon
                size={18}
                className="text-tertiary-foreground hover:text-secondary-foreground transition-colors"
              />
            </NavItemWithTooltip>
          </div>
        </div>
        <Panel
          open={panel !== null}
          title={getTitleForPanel(panel)}
          onClose={() => {
            if (panel !== null) {
              setPanel(panel);
            }
          }}
        >
          {panel === 'explorer' && <ExplorerPanel />}
          {panel === 'packages' && <PackagesPanel />}
        </Panel>
      </div>
    </>
  );
}

function NavItemWithTooltip(props: {
  children: React.ReactNode;
  tooltipContent: string;
  onClick: () => void;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="icon"
            size="icon"
            className="active:translate-y-0"
            onClick={props.onClick}
          >
            {props.children}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">{props.tooltipContent}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function Panel(props: {
  open: boolean;
  title: string | null;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!props.open) {
    return null;
  }

  return (
    <div className="h-full flex flex-col bg-muted animate-in slide-in-from-left duration-75">
      <div className="flex items-center justify-between h-14 px-3 border-l">
        <h4 className="px-2 text-sm font-medium leading-none">{props.title}</h4>
        <button
          className="p-2 text-tertiary-foreground hover:text-foreground hover:bg-sb-core-20 dark:hover:bg-sb-core-110 rounded-sm"
          onClick={props.onClose}
        >
          <ChevronsLeftIcon size={14} />
        </button>
      </div>
      <div className="min-w-[200px] border-l pr-1.5 flex-1 overflow-auto">{props.children}</div>
    </div>
  );
}
