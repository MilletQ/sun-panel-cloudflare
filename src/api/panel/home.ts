import { post } from '@/utils/request'
import type { VisitMode } from '@/enums/auth'

export type HomeItemGroup = {
  items: Panel.ItemInfo[]
} & Panel.ItemIconGroup

export type HomeData = {
  user: User.Info
  visitMode: VisitMode
  panel: Panel.panelConfig | null
  searchEngine: unknown
  searchBox: DeskModule.SearchBox.State | null
  itemIconGroups: HomeItemGroup[]
}

export function getData<T>() {
  return post<T>({
    url: '/panel/home/getData',
  })
}
