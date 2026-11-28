"use client";

import { useTranslation } from "react-i18next";
import {
  ChevronDownIcon,
  CloudIcon,
  CodeXmlIcon,
  LogOutIcon,
  MenuIcon,
  MessagesSquareIcon,
  MusicIcon,
  UserRoundIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import type { Game, RequestFn } from "@/App";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HandleText } from "@/components/ui/handle-text";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useProfileAvatar } from "@/hooks/use-profile-avatar";
import { useBackupData } from "@/store/backup-data";
import type { AccountSection } from "@/lib/app-types";
import type { Session } from "@/lib/session";
import { cn } from "@/lib/utils";

export type AppPage =
  "account" | "aliases" | "backups" | "songs" | "developer" | "users";

export const APP_PAGES: readonly AppPage[] = [
  "account",
  "aliases",
  "backups",
  "songs",
  "developer",
  "users",
];

type NavItem = {
  page: AppPage;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
};

const WORKSPACE_ITEMS: readonly NavItem[] = [
  { page: "account", label: "账号", icon: UserRoundIcon },
  { page: "aliases", label: "社区别名", icon: MessagesSquareIcon },
  { page: "backups", label: "云备份", icon: CloudIcon },
  { page: "songs", label: "歌曲", icon: MusicIcon },
];

const ADMIN_ITEMS: readonly NavItem[] = [
  { page: "developer", label: "开发者", icon: CodeXmlIcon },
  { page: "users", label: "用户管理", icon: UsersIcon, adminOnly: true },
];

export const APP_PAGE_LABELS: Record<AppPage, string> = Object.fromEntries(
  [...WORKSPACE_ITEMS, ...ADMIN_ITEMS].map((item) => [item.page, item.label]),
) as Record<AppPage, string>;

export function isAppPage(value: string): value is AppPage {
  return (APP_PAGES as readonly string[]).includes(value);
}

const GAME_ICONS: Record<Game, string> = {
  maimaid: "/app-icon.png",
  chunithmd: "/chunithmd-icon-192.png",
};

export function GameSwitcher({
  game,
  onGameChange,
  className,
}: {
  game: Game;
  onGameChange: (game: Game) => void;
  className?: string;
}) {
  const { t } = useTranslation("sidebar");
  return (
    <div className={cn(className)}>
      <Select
        value={game}
        onValueChange={(value) =>
          onGameChange(value === "chunithmd" ? "chunithmd" : "maimaid")
        }
      >
        <SelectTrigger size="sm" className="w-full" aria-label={t("game")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="maimaid">maimaid</SelectItem>
          <SelectItem value="chunithmd">chunithmd</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

type SidebarBodyProps = {
  activePage: AppPage;
  accountSection: AccountSection;
  isAdmin: boolean;
  session: Session;
  request: RequestFn;
  game: Game;
  onGameChange: (game: Game) => void;
  onNavigate: (page: AppPage) => void;
  onNavigateAccountSection: (section: AccountSection) => void;
  onLogout: () => void | Promise<void>;
  className?: string;
};

function NavButton({
  item,
  active,
  onSelect,
  expanded,
}: {
  item: NavItem;
  active: boolean;
  onSelect: (page: AppPage) => void;
  /** When provided, renders a chevron (used by the expandable account item). */
  expanded?: boolean;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(item.page)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active
          ? "bg-muted font-medium text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {active ? (
        <span
          aria-hidden
          className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary"
        />
      ) : null}
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{item.label}</span>
      {typeof expanded === "boolean" ? (
        <ChevronDownIcon
          aria-hidden
          className={cn(
            "ml-auto size-4 shrink-0 text-muted-foreground transition-transform",
            !expanded && "-rotate-90",
          )}
        />
      ) : null}
    </button>
  );
}

function AccountSectionNav({
  activeSection,
  onSelect,
}: {
  activeSection: AccountSection;
  onSelect: (section: AccountSection) => void;
}) {
  const { t } = useTranslation("settings");
  const sections: Array<{ value: AccountSection; label: string }> = [
    { value: "overview", label: t("tabOverview") },
    { value: "security", label: t("tabSecurity") },
    { value: "oauthApps", label: t("tabOauthApps") },
  ];
  return (
    <ul className="mt-0.5 ml-4 flex flex-col gap-0.5 border-l pl-3">
      {sections.map((section) => {
        const active = activeSection === section.value;
        return (
          <li key={section.value}>
            <button
              type="button"
              onClick={() => onSelect(section.value)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                active
                  ? "bg-muted/80 font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <span className="truncate">{section.label}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function SidebarBody({
  activePage,
  accountSection,
  isAdmin,
  session,
  request,
  game,
  onGameChange,
  onNavigate,
  onNavigateAccountSection,
  onLogout,
  className,
}: SidebarBodyProps) {
  const { t } = useTranslation(["sidebar", "settings"]);
  const profileAvatar = useProfileAvatar(request, game);
  const { selectedProfile } = useBackupData();
  const avatarSrc =
    selectedProfile?.avatarDataUrl ??
    selectedProfile?.avatarUrl ??
    profileAvatar.avatarDataUrl ??
    profileAvatar.avatarUrl;
  const navItems = ADMIN_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="flex items-center gap-2.5 px-4 py-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- local static icon */}
        <img
          src={GAME_ICONS[game]}
          alt=""
          className="size-9 shrink-0 object-contain"
        />
        <div className="min-w-0">
          <p className="truncate text-sm leading-tight font-semibold">
            Rhythmeta
          </p>
          <p className="truncate text-[0.7rem] text-muted-foreground">
            Dashboard
          </p>
        </div>
      </div>

      <nav
        aria-label={t("sidebar:navMenu")}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 pb-4"
      >
        <div className="flex flex-col gap-1">
          <p className="px-3 pt-2 pb-1 text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
            {t("sidebar:workspace")}
          </p>
          {WORKSPACE_ITEMS.map((item) =>
            item.page === "account" ? (
              <div key={item.page} className="flex flex-col">
                <NavButton
                  item={item}
                  active={activePage === "account"}
                  onSelect={onNavigate}
                  expanded={activePage === "account"}
                />
                {activePage === "account" ? (
                  <AccountSectionNav
                    activeSection={accountSection}
                    onSelect={onNavigateAccountSection}
                  />
                ) : null}
              </div>
            ) : (
              <NavButton
                key={item.page}
                item={item}
                active={activePage === item.page}
                onSelect={onNavigate}
              />
            ),
          )}
        </div>
        {navItems.length > 0 ? (
          <div className="flex flex-col gap-1">
            <p className="px-3 pt-2 pb-1 text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
              {t("sidebar:management")}
            </p>
            {navItems.map((item) => (
              <NavButton
                key={item.page}
                item={item}
                active={activePage === item.page}
                onSelect={onNavigate}
              />
            ))}
          </div>
        ) : null}
      </nav>

      <div className="mt-auto flex flex-col gap-3 border-t p-3">
        <GameSwitcher
          game={game}
          onGameChange={onGameChange}
          className="pb-0.5"
        />
        <div className="flex items-center gap-2.5">
          <Avatar className="size-9 rounded-lg">
            {avatarSrc ? (
              <AvatarImage
                src={avatarSrc}
                alt=""
                referrerPolicy="no-referrer"
                className="object-cover"
              />
            ) : null}
            <AvatarFallback>
              {session.user.handle.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <HandleText
              handle={session.user.handle}
              className="block truncate text-sm font-medium"
            />
            <p className="truncate text-[0.7rem] text-muted-foreground">
              {session.user.email}
            </p>
          </div>
          {isAdmin ? (
            <Badge variant="secondary" className="shrink-0">
              {t("settings:roleAdmin")}
            </Badge>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => void onLogout()}
          >
            <LogOutIcon data-icon="inline-start" />
            {t("sidebar:logout")}
          </Button>
        </div>
      </div>
    </div>
  );
}

type AppSidebarProps = {
  activePage: AppPage;
  accountSection: AccountSection;
  isAdmin: boolean;
  session: Session;
  request: RequestFn;
  game: Game;
  onGameChange: (game: Game) => void;
  onNavigate: (page: AppPage) => void;
  onNavigateAccountSection: (section: AccountSection) => void;
  onLogout: () => void | Promise<void>;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
};

export function AppSidebar({
  activePage,
  accountSection,
  isAdmin,
  session,
  request,
  game,
  onGameChange,
  onNavigate,
  onNavigateAccountSection,
  onLogout,
  mobileOpen,
  onMobileOpenChange,
}: AppSidebarProps) {
  const { t } = useTranslation("sidebar");

  return (
    <>
      <aside className="hidden w-64 shrink-0 border-r bg-card/30 md:flex md:h-full md:flex-col">
        <SidebarBody
          activePage={activePage}
          accountSection={accountSection}
          isAdmin={isAdmin}
          session={session}
          request={request}
          game={game}
          onGameChange={onGameChange}
          onNavigate={onNavigate}
          onNavigateAccountSection={onNavigateAccountSection}
          onLogout={onLogout}
        />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent side="left" className="w-72 bg-card p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>{t("navMenu")}</SheetTitle>
          </SheetHeader>
          <SidebarBody
            activePage={activePage}
            accountSection={accountSection}
            isAdmin={isAdmin}
            session={session}
            request={request}
            game={game}
            onGameChange={onGameChange}
            onNavigate={(page) => {
              onNavigate(page);
              onMobileOpenChange(false);
            }}
            onNavigateAccountSection={(section) => {
              onNavigateAccountSection(section);
              onMobileOpenChange(false);
            }}
            onLogout={onLogout}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}

export function AppMobileHeader({
  activePage,
  onOpenSidebar,
}: {
  activePage: AppPage;
  onOpenSidebar: () => void;
}) {
  const { t } = useTranslation("sidebar");
  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-background/90 px-3 py-2.5 backdrop-blur md:hidden">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t("openNavMenu")}
        onClick={onOpenSidebar}
      >
        <MenuIcon />
      </Button>
      <span className="min-w-0 truncate text-sm font-semibold">
        {APP_PAGE_LABELS[activePage]}
      </span>
    </header>
  );
}
