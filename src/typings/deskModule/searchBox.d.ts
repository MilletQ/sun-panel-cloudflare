declare namespace DeskModule.SearchBox {

  type SearchEngine = {
    iconSrc: string
    title: string
    url: string
  }

  type State = {
    currentSearchEngine: SearchEngine
    searchEngineList: SearchEngine[]
    newWindowOpen: boolean
  }

}
