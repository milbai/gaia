'use strict';
/* global FilterManager, CardManager, Clock, Edit, Folder, CardUtil, CardPicker,
          KeyNavigationAdapter, MessageHandler, MozActivity, SearchBar,
          SpatialNavigator, URL, XScrollable, Animations, Utils */
/* jshint nonew: false */
(function(exports) {
  const CARDLIST_LEFT_MARGIN = 8.4;
  const FOLDER_CAPACITY = 9;

  /**
   * Main class of smart-home
   * @class Home
   */
  function Home() {}

  Home.prototype = {

    navigableIds:
        ['search-button', 'search-input', 'filter-tab-group',
            'add-folder-button'],

    topElementIds: ['search-button', 'search-input', 'add-folder-button'],

    bottomElementIds: ['filter-tab-group', 'filter-all-button',
        'filter-tv-button', 'filter-device-button', 'filter-app-button',
        'filter-website-button'],

    isNavigable: true,
    navigableClasses: ['filter-tab', 'command-button'],
    navigableScrollable: [],
    cardScrollable: undefined,
    folderScrollable: undefined,
    _focus: undefined,
    _focusScrollable: undefined,
    _folderCard: undefined,
    _checkAddFolderButtonTimer: undefined,

    filterElementIds: ['filter-all-button', 'filter-tv-button',
        'filter-device-button', 'filter-app-button', 'filter-website-button'],

    filterManager: undefined,
    mainSection: document.getElementById('main-section'),
    cardListElem: document.getElementById('card-list'),
    folderListElem: document.getElementById('folder-list'),
    cardManager: undefined,
    addFolderButton: document.getElementById('add-folder-button'),
    searchButton: document.getElementById('search-button'),
    timeElem: document.getElementById('time'),
    contextmenuElem: document.getElementById('card-menu'),
    moveMenuItem: document.getElementById('move-menuitem'),
    renameMenuItem: document.getElementById('rename-menuitem'),
    unpinMenuItem: document.getElementById('unpin-menuitem'),
    editFolderMenuItem: document.getElementById('edit-folder-menuitem'),


    init: function() {
      var that = this;

      this.initClock();
      this.initContextMenu();

      this.cardManager = new CardManager();
      this.cardManager.init();

      CardUtil.init(this.cardManager);

      this.searchBar = new SearchBar();
      this.searchBar.init(document.getElementById('search-bar'));
      this.searchBar.on('shown', this.onSearchBarShown.bind(this));
      this.searchBar.on('hidden', this.onSearchBarHidden.bind(this));

      this.cardManager.getCardList().then(function(cardList) {
        that.messageHandler = new MessageHandler();
        that.messageHandler.init(that);

        that._createCardList(cardList);
        that.cardScrollable = new XScrollable({
                frameElem: 'card-list-frame',
                listElem: 'card-list',
                itemClassName: 'app-button',
                leftMargin: CARDLIST_LEFT_MARGIN});

        that.folderScrollable = new XScrollable({
                frameElem: 'folder-list-frame',
                listElem: 'folder-list',
                itemClassName: 'app-button',
                leftMargin: CARDLIST_LEFT_MARGIN,
                scale: 0.68,
                referenceElement: that.cardScrollable});

        that.navigableScrollable = [that.cardScrollable, that.folderScrollable];
        var collection = that._getNavigateElements();

        that.spatialNavigator = new SpatialNavigator(collection);
        that.spatialNavigator.ignoreHiddenElement = true;
        that.spatialNavigator.straightOnly = true;

        that.keyNavigatorAdapter = new KeyNavigationAdapter();
        that.keyNavigatorAdapter.init();
        that.keyNavigatorAdapter.on('move', that.onMove.bind(that));
        // All behaviors which no need to have multple events while holding
        // the key should use keyup.
        that.keyNavigatorAdapter.on('enter-keyup', that.onEnter.bind(that));

        that.cardListElem.addEventListener('transitionend',
                                      that.determineFolderExpand.bind(that));

        that.cardManager.on('card-inserted',
                          that.onCardInserted.bind(that, that.cardScrollable));
        that.cardManager.on('card-removed',
                          that.onCardRemoved.bind(that, that.cardScrollable));
        that.cardManager.on('card-updated',
                          that.onCardUpdated.bind(that, that.cardScrollable));
        that.cardManager.on('folder-changed', that.onFolderChanged.bind(that));

        that.spatialNavigator.on('focus', that.handleFocus.bind(that));
        that.spatialNavigator.on('unfocus', that.handleUnfocus.bind(that));
        var handleCardFocusBound = that.handleCardFocus.bind(that);
        var handleCardUnfocusBound = that.handleCardUnfocus.bind(that);
        var handleCardUnhoverBound = that.handleCardUnhover.bind(that);

        that.navigableScrollable.forEach(function(scrollable) {
          scrollable.on('focus', handleCardFocusBound);
          scrollable.on('unfocus', handleCardUnfocusBound);
          scrollable.on('unhover', handleCardUnhoverBound);
          if (scrollable.isEmpty()) {
            that.spatialNavigator.remove(scrollable);
          }
        });

        that.edit = new Edit();
        that.edit.init(that.spatialNavigator, that.cardManager,
                       that.cardScrollable, that.folderScrollable, that);
        that.edit.on('arrange', that.onArrangeMode.bind(that));

        that.filterManager = new FilterManager();
        that.filterManager.init({
          cardListElem: that.cardListElem,
          cardScrollable: that.cardScrollable,
          home: that,
          cardManager: that.cardManager,
        });
        that.filterManager.on('filter-changed',
          that.onFilterChanged.bind(that));

        // In some case, we can do action at keydown which is translated as
        // onEnter in home.js. But in button click case, we need to listen
        // keyup. So, instead keydown/keyup, we just use click event to handle
        // it. The click event is translated at smart-button when use press
        // enter on smart-button.
        that.searchButton.addEventListener('click', function() {
          that.searchBar.show();
          // hide the searchButton because searchBar has an element whose
          // appearance is the same as it.
          that.searchButton.classList.add('hidden');
        }.bind(that));

        // handle animation
        that.endBubble = null;
        document.addEventListener(
                'visibilitychange', that.onVisibilityChange.bind(that));
        // if this init function is executed after the document is set to
        // visible, the visibilitychange event may not be triggered.
        if (document.visibilityState === 'visible') {
          that.onVisibilityChange();
        }

        cardList.forEach(function(card) {
          if (card instanceof Folder) {
            card.on('card-inserted',
                        that.onCardInserted.bind(that, that.folderScrollable));
            card.on('card-removed',
                        that.onCardRemoved.bind(that, that.folderScrollable));
            card.on('card-updated',
                        that.onCardUpdated.bind(that, that.folderScrollable));
          }
        });

        that._cardPicker = new CardPicker();
        that._cardPicker.init({
          cardManager: that.cardManager,
          cardScrollable: that.cardScrollable
        });
        that._cardPicker.on('hide', that.onCardPickerHide.bind(that));
        that._cardPicker.on('show', that.onCardPickerShow.bind(that));
      });
    },

    initContextMenu: function () {
      this.moveMenuItem.addEventListener('click',
        this.onMoveMenuItemClick.bind(this));

      this.renameMenuItem.addEventListener('click',
        this.onRenameMenuItemClick.bind(this));

      this.unpinMenuItem.addEventListener('click',
        this.onUnpinMenuItemClick.bind(this));

      this.editFolderMenuItem.addEventListener('click',
        this.onEditFolderMenuItemClick.bind(this));
    },

    onMoveMenuItemClick: function () {
      this.edit.toggleEditMode();
      this.edit.toggleArrangeMode();
    },

    onRenameMenuItemClick: function () {
      this.edit.renameCard(this.focusScrollable,
        this.focusScrollable.getNodeFromItem(this.focusScrollable.currentItem));
    },

    onUnpinMenuItemClick: function () {
      this.edit.deleteCard(
        this.focusScrollable,
        this.focusScrollable.getNodeFromItem(this.focusScrollable.currentItem)
      );
    },

    onEditFolderMenuItemClick: function () {
      this._cardPicker.show(this.cardScrollable.currentItem);
    },

    enableContextMenu: function () {
      var focus = this.spatialNavigator.getFocusedElement();
      if (this.mode === '' &&
        (focus === this.cardScrollable || focus === this.folderScrollable)) {
        this.mainSection.setAttribute('contextmenu', this.contextmenuElem.id);
      }
    },

    disableContextMenu: function () {
      this.mainSection.setAttribute('contextmenu', '');
    },

    updateContextMenu: function (itemElem) {
      var type = itemElem.getAttribute('app-type');
      if (this.contextmenuElem.dataset.currentAppType == type) {
        return;
      }
      this.contextmenuElem.dataset.currentAppType = type;

      // Clean up first
      for (var i = this.contextmenuElem.childNodes.length - 1; i >= 0; --i) {
        this.contextmenuElem.removeChild(this.contextmenuElem.childNodes[i]);
      }

      this.contextmenuElem.appendChild(this.moveMenuItem);

      switch (type) {
        case 'folder':
          this.contextmenuElem.appendChild(this.editFolderMenuItem);
          break;

        case 'tv':
        case 'app':
        case 'appbookmark':
          this.contextmenuElem.appendChild(this.renameMenuItem);
          this.contextmenuElem.appendChild(this.unpinMenuItem);
          break;
      }
    },

    onVisibilityChange: function() {
      if (document.visibilityState === 'visible') {
        Utils.holdFocusForAnimation();
        this.cardListElem.classList.remove('hidden');
        var that = this;
        Promise.all([new Promise(function(resolve) {
          that.skipBubble = Animations.doBubbleAnimation(
                                that.cardListElem, '.app-button', 100, resolve);

        }), new Promise(function(resolve) {
          if (that._folderCard) {
            that.skipFolderBubble = Animations.doBubbleAnimation(
                              that.folderListElem, '.app-button', 100, resolve);
          } else {
            resolve();
          }

        })]).then(function() {
          // Catch focus back unless there is a pin activity since callback of
          // pinning would catch the focus for us.
          if (that.messageHandler.hasPendingActivity()) {
            that.spatialNavigator.focus(that.cardScrollable);
            if (that.mode == 'filter') {
              that.filterManager.once('filter-animation-end', () => {
                that.messageHandler.resumeActivity();
              });
              that.filterManager.resetFilter();
            } else {
              that.messageHandler.resumeActivity();
            }
          } else {
            that.messageHandler.resumeActivity();

            var focusedElement = that.spatialNavigator.getFocusedElement();
            if (focusedElement &&
                that.topElementIds.includes(focusedElement.id)) {
              that.spatialNavigator.focus(that.cardScrollable);
            } else {
              that.spatialNavigator.focus();
            }
          }

          that.isNavigable = true;
          that.skipBubble = null;
          that.skipFolderBubble = null;
        });
      } else {
        this.cardListElem.classList.add('hidden');
        this.messageHandler.stopActivity();
        this.isNavigable = false;
        // An user may close home app when bubbling or sliding animations are
        // still playing, and then open home app again right away. In this case,
        // the user will see the last unfinished animations. In order to solve
        // this, we have to force disable all the animations and trigger their
        // callbacks when home app is in hidden state.
        if (this.skipBubble) {
          this.skipBubble();
        }
        if (this.skipFolderBubble) {
          this.skipFolderBubble();
        }
        if (this.cardScrollable.isSliding) {
          this.cardScrollable.endSlide();
        }
        if (this._cardPicker.isShown) {
          this._cardPicker.mode = '';
          this._cardPicker.hide();
        }
      }
    },

    initClock: function() {
      this.clock = new Clock();
      this.clock.start(this.updateClock.bind(this));
      // Listen to 'moztimechange'
      window.addEventListener('moztimechange',
                              this.restartClock.bind(this));
      // Listen to 'timeformatchange'
      window.addEventListener('timeformatchange',
                              this.restartClock.bind(this));
      // Listen to 'DOMRetranslated'
      document.addEventListener('DOMRetranslated',
                              this.restartClock.bind(this));
    },

    onCardInserted: function(scrollable, card, idx, overFolder, silent) {
      if (!this._folderCard && scrollable === this.folderScrollable) {
        // If we inserted a card into a folder that's not shown in
        // folderScrollable yet, there's nothing to do here.
        // This happens on creating a new folder from a cardPicker.
        return;
      }
      if (card instanceof Folder) {
        card.on('card-inserted',
                this.onCardInserted.bind(this, this.folderScrollable));
        card.on('card-removed',
                this.onCardRemoved.bind(this, this.folderScrollable));
        card.on('card-updated',
                this.onCardUpdated.bind(this, this.folderScrollable));
      }

      var newCardElem = this.createCardNode(card);
      var newCardButtonElem = newCardElem.firstElementChild;
      if (!silent) {
        // Initial transition for new card
        newCardButtonElem.classList.add('new-card');
        newCardButtonElem.classList.add('new-card-transition');
        newCardButtonElem.addEventListener('transitionend',
        function onPinned() {
          newCardButtonElem.classList.remove('new-card-transition');
          newCardButtonElem.classList.remove('last-card');
          newCardButtonElem.removeEventListener('transitionend', onPinned);
        });
        // insert new card into cardScrollable
        this.isNavigable = false;
        scrollable.on('slideEnd', function() {
          newCardButtonElem.classList.remove('new-card');
          if (scrollable.nodes.indexOf(newCardElem) ===
              scrollable.nodes.length - 1) {
            newCardButtonElem.classList.add('last-card');
          }
          this.isNavigable = true;
        }.bind(this));
      }

      if (!overFolder) {
        scrollable.insertNodeBefore(newCardElem, idx, {silent: silent});
      } else {
        scrollable.insertNodeOver(newCardElem, idx);
      }

      this.checkAddFolderButton();
    },

    onCardUpdated: function(scrollable, card, idx) {
      CardUtil.updateCardName(scrollable.getNode(idx), card);
    },

    onFolderChanged: function(folder) {
      var folderButtons = document.querySelectorAll(
        '.app-button[data-card-id="' + folder.cardId + '"]');
      Array.from(folderButtons).forEach(function(folderButton) {
        CardUtil.updateFolderCardIcons(folderButton, folder);
      });
    },

    onCardRemoved: function(scrollable, indices) {
      indices.forEach(function(idx) {
        var elm = scrollable.getNode(idx);
        var cardButton = (elm && elm.querySelector('smart-button'));
        if (cardButton) {
          if (cardButton.dataset.revokableURL) {
            URL.revokeObjectURL(cardButton.dataset.revokableURL);
          }
          if (cardButton.getAttribute('app-type') == 'folder') {
            CardUtil.revokeFolderCardIcons(cardButton);
          }
        }
      }, this);
      scrollable.removeNodes(indices);

      if (scrollable === this.cardScrollable) {
        // When editing folder by card picker, it's possible that cards prior to
        // the folder is moved into it, changing folder's position. We should
        // refresh the position of folderScrollable in this.
        this.folderScrollable.realignToReferenceElement();
      }

      this.checkAddFolderButton();
    },

    onArrangeMode: function() {
      if (this._focusScrollable !== this.folderScrollable) {
        this.cleanFolderScrollable();
      }
    },

    createCardNode: function(card) {
      // card element would be created like this:
      // <div class="card">
      //   <smart-button>/* Card button */</smart-button>
      //   <span>/* Card name */</span>
      //   <section class="card-panel">
      //     <smart-button>/* Rename button */</smart-button>
      //     <smart-button>/* Delete button */</smart-button>
      //   </section>
      // </div>
      // and return DOM element
      var cardNode = document.createElement('div');
      cardNode.classList.add('card');

      var cardFragment = CardUtil.createCardFragment(card);

      var cardPanel = document.createElement('section');
      cardPanel.className = 'card-panel';

      var renameButton = document.createElement('smart-button');
      renameButton.dataset.icon = 'rename';
      renameButton.classList.add('rename-btn');

      var deleteButton = document.createElement('smart-button');
      deleteButton.dataset.icon = 'delete';
      deleteButton.classList.add('delete-btn');

      cardPanel.appendChild(renameButton);
      cardPanel.appendChild(deleteButton);

      cardNode.appendChild(cardFragment);
      cardNode.appendChild(cardPanel);

      return cardNode;
    },

    _createCardList: function(cardList) {
      cardList.forEach(function(card) {
        this.cardListElem.appendChild(this.createCardNode(card));
      }.bind(this));
      this.checkAddFolderButton();
    },

    onMove: function(key) {
      if (!this.isNavigable || this.edit.onMove(key)) {
        return;
      }

      var focus = this.spatialNavigator.getFocusedElement();

      if (focus.CLASS_NAME == 'XScrollable' && focus.move(key)) {
        return;
      }

      // Avoid leaving "filter-tab-group" during filter changing
      if (key == 'up' && focus.matches &&
          focus.matches('#filter-tab-group smart-button') &&
          this.filterManager.isFilterChanging()) {
        return;
      }

      this.spatialNavigator.move(key);
    },

    onEnter: function() {
      if (!this.isNavigable || this.edit.onEnter()) {
        return;
      }

      var focusElem = this.focusElem;

      if (focusElem === this.addFolderButton) {
        this.showAddFolderDialog();
      } else if (focusElem &&
          this.filterElementIds.indexOf(focusElem.id) > -1) {
        this.cleanFolderScrollable();
      } else {
        // Current focus is on a card
        var cardId = focusElem.dataset.cardId;
        var card;
        if (this.focusScrollable === this.folderScrollable) {
          card = this._folderCard.findCard({cardId: cardId});
        } else {
          card = this.cardManager.findCardFromCardList({cardId: cardId});
        }

        if (card) {
          card.launch();
        }
      }
    },

    onSearchBarShown: function() {
      var hideSearchBar = function() {
        document.removeEventListener('visibilitychange', hideSearchBar);
        this.searchBar.hide();
      }.bind(this);
      document.addEventListener('visibilitychange', hideSearchBar);

      var activity = new MozActivity({
        name: 'search',
        data: { keyword: '' }
      });

      activity.onerror = hideSearchBar;
    },

    onSearchBarHidden: function() {
      this.searchButton.classList.remove('hidden');
    },

    _getNavigateElements: function() {
      var elements = [];
      this.navigableIds.forEach(function(id) {
        var elem = document.getElementById(id);
        if (elem) {
          elements.push(elem);
        }
      });
      this.navigableClasses.forEach(function(className) {
        var elems = document.getElementsByClassName(className);
        if (elems.length) {
          // Change HTMLCollection to array before concatenating
          elements = elements.concat(Array.prototype.slice.call(elems));
        }
      });
      elements = elements.concat(this.navigableScrollable);
      return elements;
    },

    handleFocus: function(elem) {
      if (elem.CLASS_NAME == 'XScrollable') {
        this._focusScrollable = elem;
        elem.focus();
        this.checkFocusedGroup();
      } else if (elem.nodeName) {
        if (this._focus) {
          this._focus.blur();
        }

        this._focusScrollable = undefined;

        switch(elem.nodeName.toLowerCase()) {
          case 'menu-group':
            this.handleFocusMenuGroup(elem);
            break;
          default:
            elem.focus();
            this._focus = elem;
            this.checkFocusedGroup(elem);
            break;
        }
      } else {
        this._focusScrollable = undefined;
      }

      if (!this._focusScrollable) {
        this.cleanFolderScrollable();
      }

      document.getElementById('main-section').classList.toggle(
        'folder-scrollable-focused',
        this._focusScrollable === this.folderScrollable
      );
    },

    handleUnfocus: function(elem, nodeElem) {
      if(elem.CLASS_NAME == 'XScrollable') {
        this.handleCardUnfocus(
                elem, elem.currentItem, elem.getNodeFromItem(elem.currentItem));
      }
    },

    checkFocusedGroup: function(elem) {
      if (!this._focusedGroup) {
        return;
      }

      // close the focused group when we move focus out of this group.
      if (!elem || !this._focusedGroup.contains(elem)) {
        this._focusedGroup.close();
        this._focusedGroup = null;
      }
    },

    handleFocusMenuGroup: function(menuGroup) {
      var self = this;
      menuGroup.once('opened', function() {
        self.spatialNavigator.remove(menuGroup);

        var buttons = menuGroup.getElementsByTagName('smart-button');
        var currentFilterElement = menuGroup.querySelector(
          '[data-icon-type="' + self.filterManager.getCurrentFilter() + '"]');

        self.spatialNavigator.multiAdd(buttons);
        self.spatialNavigator.focus(currentFilterElement || buttons[0]);
      });
      menuGroup.once('will-close', function() {
        // Clear all opened event listener because we won't have it if opened is
        // not fired and the group is trying to close it self.
        menuGroup.off('opened');
        self.spatialNavigator.add(menuGroup);
        self.spatialNavigator.multiRemove(
          menuGroup.getElementsByTagName('smart-button'));
      });
      this.checkFocusedGroup(menuGroup);
      this._focusedGroup = menuGroup;
      menuGroup.open();
    },

    handleCardFocus: function(scrollable, itemElem, nodeElem) {
      this._focus = itemElem;

      if (this.edit.mode === 'edit') {
        this.edit.handleCardFocus(scrollable, itemElem, nodeElem);
      }

      itemElem.focus();
      nodeElem.classList.add('focused');
      if (itemElem.getAttribute('app-type') === 'folder') {
        itemElem.classList.add('opened');
      }

      if(scrollable === this.cardScrollable && this._folderCard &&
                        itemElem.dataset.cardId !== this._folderCard.cardId &&
                        !this.cardScrollable.isHovering) {
        this.cleanFolderScrollable();
      }
      this.updateContextMenu(itemElem);
      this.enableContextMenu();
    },

    cleanFolderScrollable: function(doNotChangeFocus) {
      if (this._focusScrollable === this.folderScrollable &&
          !doNotChangeFocus) {
        this.spatialNavigator.focus(this.cardScrollable);
      }
      this.spatialNavigator.remove(this.folderScrollable);
      this.folderScrollable.clean();

      if (this._folderCard) {
        var folderButton = document.querySelector(
          '.app-button[data-card-id="' + this._folderCard.cardId + '"]');
        if (folderButton) {
          folderButton.classList.remove('opened');
        }
        this._folderCard = undefined;
      }
      this.cardListElem.classList.remove('hide-card-name');
      this.edit.isFolderReady = false;
      this.cardScrollable.setColspanOnFocus(0);
    },

    handleCardUnfocus: function(scrollable, itemElem, nodeElem) {
      if (itemElem && itemElem.getAttribute('app-type') === 'folder' &&
          (!this._folderCard ||
           this._folderCard.cardId != itemElem.dataset.cardId)) {
        itemElem.classList.remove('opened');
      }

      // Fix null error when the last card in a folder is removed.
      if (nodeElem) {
        nodeElem.classList.remove('focused');
      }
      this.disableContextMenu();
    },

    handleCardUnhover: function(scrollable, itemElem, nodeElem) {
      this.cleanFolderScrollable();
    },

    determineFolderExpand: function(evt) {
      // Folder expansion is performed on only when user moves cursor onto a
      // folder or hover a folder in edit mode and it finished its focus
      // transition.
      if (this.focusScrollable === this.cardScrollable &&
        evt.originalTarget.classList.contains('app-button') &&
        (!this._folderCard ||
          this._folderCard.cardId !== evt.originalTarget.dataset.cardId) &&
        (evt.originalTarget.classList.contains('focused') &&
          (evt.propertyName === 'transform' ||
          // Also listen to 'outline-width' for edit mode when user moves
          // from panel button back to card.
          // outline-width doesn't raise when inserting a new folder since it's
          // focused from the start.
           evt.propertyName === 'outline-width') &&
          this.mode !== 'arrange' ||
          // Folder needs to be expanded when hovered as well.
          evt.originalTarget.classList.contains('hovered'))) {
        this.buildFolderList(evt.originalTarget);
      }
    },

    buildFolderList: function(target) {
      var cardId = target.dataset.cardId;
      var card = this.cardManager.findCardFromCardList({cardId: cardId});
      if (!(card instanceof Folder)) {
        return;
      }

      target.classList.add('opened');

      this._folderCard = card;
      var folderList = this._folderCard.getCardList();

      if (folderList.length === 0) {
        this.edit.isFolderReady = true;
        // Needs to disable the folder-list animation right away to
        // prevent it from affecting the new-card into folder animation.
        this.folderListElem.style.transition = 'none';
        return;
      }

      // Build folder list
      folderList.forEach(function(card) {
        this.folderScrollable.addNode(this.createCardNode(card));
      }, this);

      var isFirstFrame = true;
      var initFolderAnimation = function() {
        if (isFirstFrame) {
          isFirstFrame = false;
          // At first frame, we call setReferenceElement to move folder list
          // right under folder card. Transition should be replaced by 'none'
          // since we don't need to show this process as animation to user.
          this.folderListElem.style.transition = 'none';
          this.folderScrollable.realignToReferenceElement();
          this.skipFolderBubble = Animations.doBubbleAnimation(
                        this.folderListElem, '.app-button', 100, function() {
              this.spatialNavigator.add(this.folderScrollable);
              this.edit.isFolderReady = true;
              this.skipFolderBubble = undefined;
            }.bind(this));

          window.requestAnimationFrame(initFolderAnimation);
        } else {
          // 2nd frame, recover original transition.
          this.folderListElem.style.transition = '';
          this.cardListElem.classList.add('hide-card-name');
        }
      }.bind(this);
      window.requestAnimationFrame(initFolderAnimation);
    },

    openSettings: function() {
      /* jshint nonew: false */
      new MozActivity({
        name: 'configure',
        data: {}
      });
    },

    showAddFolderDialog: function() {
      this._cardPicker.show();
    },

    onFilterChanged: function (filterName) {
      if (filterName === FilterManager.FILTERS.ALL.name) {
        this.mode = '';
      } else {
        this.mode = 'filter';
      }

      this.checkAddFolderButton();
    },

    checkAddFolderButton: function() {
      // The timer is used for avoiding some unnatural animations (e.g. fade out
      // and immediately fade in) when doing continuous actions.
      if (this._checkAddFolderButtonTimer) {
        clearTimeout(this._checkAddFolderButtonTimer);
      }
      this._checkAddFolderButtonTimer = setTimeout(() => {
        this.addFolderButton.classList.toggle('hidden',
          this.mode == 'filter' || !this.cardManager.hasCardInCardList());
        this._checkAddFolderButtonTimer = undefined;
      }, 200);
    },

    onCardPickerShow: function () {
      this.mode = 'card-picker';
    },

    onCardPickerHide: function() {
      if (this._cardPicker.mode === 'add') {
        this._cardPicker.saveToNewFolder(this.cardScrollable.currentIndex + 1);
      } else if (this._cardPicker.mode === 'update') {
        this._cardPicker.updateFolder();
      }
      this.spatialNavigator.focus();
      this.mode = '';
    },

    updateClock: function() {
      var formatter = new Intl.DateTimeFormat(navigator.languages, {
        hour: 'numeric',
        minute: 'numeric',
        hour12: window.navigator.mozHour12
      });
      var now = new Date();

      var parts = formatter.formatToParts(now);

      var dayperiod = '';

      var timeWithoutDayPeriod = parts.map(({type, value}) => {
        if (type === 'dayperiod') {
          dayperiod = value;
          return '';
        }
        return value;
      }).join('');

      if (this.timeElem) {
        this.timeElem.textContent = timeWithoutDayPeriod;
        this.timeElem.dataset.ampm = dayperiod;
      }
    },

    restartClock: function() {
      this.clock.stop();
      this.clock.start(this.updateClock.bind(this));
    },

    get focusElem() {
      return this._focus;
    },

    get focusScrollable() {
      return this._focusScrollable;
    },

    get mode() {
      return this.mainSection.dataset.mode;
    },

    set mode(newMode) {
      this.mainSection.dataset.mode = newMode;
      if (newMode === '') {
        this.enableContextMenu();
      } else {
        this.disableContextMenu();
      }
    }
  };

  exports.Home = Home;
  exports.FOLDER_CAPACITY = FOLDER_CAPACITY;
}(window));
