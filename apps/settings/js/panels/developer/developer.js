/**
 * Handle support panel functionality with SIM and without SIM
 *
 * @module developer/developer
 */
define(function(require) {
  'use strict';

  var DialogService = require('modules/dialog_service');
  var AppsCache = require('modules/apps_cache');
  var ScreenLayout = require('shared/screen_layout');

  /**
   * @alias module:developer/developer
   * @class Developer
   * @returns {Developer}
   */
  var Developer = function() {
    this._elements = null;
  };

  Developer.prototype = {
    /**
     * Initialization.
     *
     * @access public
     * @memberOf Developer.prototype
     * @param  {HTMLElement} elements
     */
    init: function d_init(elements) {
      this._elements = elements;

      this._elements.ftuLauncher.addEventListener('click', this._launchFTU);

      this._elements.developerMode.addEventListener('click',
        this.toggleDeveloperMode);

      // hide software home button whenever the device has no hardware
      // home button
      if (!ScreenLayout.getCurrentLayout('hardwareHomeButton')) {
        this._elements.softwareHomeButton.style.display = 'none';
        // always set homegesture enabled on tablet, so hide the setting
        if (!ScreenLayout.getCurrentLayout('tiny')) {
          this._elements.homegesture.style.display = 'none';
        }
      }

      if (navigator.mozPower) {
        this._elements.resetButton.disabled = false;
        this._elements.resetButton.addEventListener('click',
          this._resetDevice.bind(this));
      } else {
        // disable button if mozPower is undefined or can't be used
        this._elements.resetButton.disabled = true;
      }
    },

    toggleDeveloperMode: function about_toggleDeveloperMode(e) {
      if (!e.target.checked) {
        return;
      }

      // Warn about enabling.
      var ANNOY_TAPS = 20;
      var _ = window.navigator.mozL10n.get;
      for (var i = 0; i < ANNOY_TAPS; i++) {
        if (!confirm(_('developer-mode-enable', {
            n: (20 - i)
          }))) {
          e.preventDefault();
          return;
        }
      }
    },

    /**
     * launch FTU app.
     *
     * @access private
     * @memberOf Developer.prototype
     */
    _launchFTU: function d__launchFTU() {
      var key = 'ftu.manifestURL';
      var req = navigator.mozSettings.createLock().get(key);
      req.onsuccess = function ftuManifest() {
        var ftuManifestURL = req.result[key];

        // fallback if no settings present
        if (!ftuManifestURL) {
          ftuManifestURL = document.location.protocol +
            '//ftu.gaiamobile.org' +
            (location.port ? (':' + location.port) : '') +
            '/manifest.webapp';
        }

        var ftuApp = null;
        AppsCache.apps().then(function(apps) {
          for (var i = 0; i < apps.length && ftuApp === null; i++) {
            var app = apps[i];
            if (app.manifestURL === ftuManifestURL) {
              ftuApp = app;
            }
          }

          if (ftuApp) {
            ftuApp.launch();
          } else {
            DialogService.alert('no-ftu', {
              title: 'no-ftu'
            });
          }
        });
      };
    },

    /**
     * popup warning dialog.
     *
     * @access private
     * @memberOf Developer.prototype
     */
    _resetDevice: function d__resetDevice() {
      require(['modules/dialog_service'], (DialogService) => {
        DialogService.confirm('reset-devtools-warning-body', {
          title: 'reset-devtools-warning-title',
          submitButton: 'reset',
          cancelButton: 'cancel'
        }).then((result) => {
          var type = result.type;
          if (type === 'submit') {
            this._wipe();
          }
        });
      });
    },

    /**
     * Reset and enable full DevTools access.
     *
     * @access private
     * @memberOf Developer.prototype
     */
    _wipe: function about__wipe() {
      var power = navigator.mozPower;
      if (!power) {
        console.error('Cannot get mozPower');
        return;
      }
      if (!power.factoryReset) {
        console.error('Cannot invoke mozPower.factoryReset()');
        return;
      }
      power.factoryReset('root');
    }
  };

  return function ctor_developer_panel() {
    return new Developer();
  };
});