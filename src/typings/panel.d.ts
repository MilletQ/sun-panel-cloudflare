declare namespace Panel {

  type Info = {

  } & ItemInfo

  type ItemInfo = {
    icon: ItemIcon | null
    title: string
    url: string
    sort?: number
    lanUrl?: string
    description?: string
    openMethod: number
    itemIconGroupId?: number
  } & Common.InfoBase

  type ItemIconGroup = {
    icon?: string
    title?: string
    sort?: number
  } & Common.InfoBase

  type ItemIcon = {
    itemType: number
    src?: string
    text?: string
    // bgColor ?: string
    backgroundColor?: string
  }

  type State = {
    rightSiderCollapsed: boolean
    leftSiderCollapsed: boolean
    networkMode: PanelStateNetworkModeEnum | null
    panelConfig: panelConfig
  }

  type panelConfig = {
    backgroundImageSrc?: string
    backgroundBlur?: number
    backgroundMaskNumber?: number
    iconStyle?: PanelPanelConfigStyleEnum
    iconTextColor?: string
    iconTextInfoHideDescription?: boolean
    iconTextIconHideTitle?: boolean
    logoText?: string
    logoImageSrc?: string
    clockShowSecond?: boolean
    clockColor?: string
    searchBoxShow?: boolean
    searchBoxSearchIcon?: boolean
    marginTop?: number
    marginBottom?: number
    maxWidth?: number
    maxWidthUnit: string
    marginX?: number
    footerHtml?: string
    netModeChangeButtonShow?: boolean
  }

  type userConfig = {
    panel: panelConfig
    searchEngine?: any
  }

  type ItemIconSortRequest = {
    sortItems: Common.SortItemRequest[]
    itemIconGroupId: number
  }
}
