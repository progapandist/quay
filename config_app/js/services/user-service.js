import * as Raven from 'raven-js';


/**
 * Service which monitors the current user session and provides methods for returning information
 * about the user.
 */
angular.module('quay-config')
       .factory('UserService', ['ApiService', 'CookieService', '$rootScope', 'Config', '$location', '$timeout',

function(ApiService, CookieService, $rootScope, Config, $location, $timeout) {
  var userResponse = {
    verified: false,
    anonymous: true,
    username: null,
    email: null,
    organizations: [],
    logins: [],
    beforeload: true
  };

  var userService = {};

  userService.hasEverLoggedIn = function() {
    return CookieService.get('quay.loggedin') == 'true';
  };

  userService.updateUserIn = function(scope, opt_callback) {
    scope.$watch(function () { return userService.currentUser(); }, function (currentUser) {
      if (currentUser) {
        $timeout(function(){
          scope.user = currentUser;
          if (opt_callback) {
            opt_callback(currentUser);
          }
        }, 0, false);
      };
    }, true);
  };

  userService.load = function(opt_callback) {
    var handleUserResponse = function(loadedUser) {
      userResponse = loadedUser;

      if (!userResponse.anonymous) {
        if (Config.MIXPANEL_KEY) {
          try {
            mixpanel.identify(userResponse.username);
            mixpanel.people.set({
              '$email': userResponse.email,
              '$username': userResponse.username,
              'verified': userResponse.verified
            });
            mixpanel.people.set_once({
              '$created': new Date()
            })
          } catch (e) {
            window.console.log(e);
          }
        }

        if (Config.MARKETO_MUNCHKIN_ID && userResponse['marketo_user_hash']) {
          var associateLeadBody = {'Email': userResponse.email};
          if (window.Munchkin !== undefined) {
            try {
              Munchkin.munchkinFunction(
                'associateLead',
                associateLeadBody,
                userResponse['marketo_user_hash']
              );
            } catch (e) {
            }
          } else {
            window.__quay_munchkin_queue.push([
              'associateLead',
              associateLeadBody,
              userResponse['marketo_user_hash']
            ]);
          }
        }

        if (window.Raven !== undefined) {
          try {
            Raven.setUser({
              email: userResponse.email,
              id: userResponse.username
            });
          } catch (e) {
            window.console.log(e);
          }
        }

        CookieService.putPermanent('quay.loggedin', 'true');
      } else {
        if (window.Raven !== undefined) {
          Raven.setUser();
        }
      }

      // If the loaded user has a prompt, redirect them to the update page.
      if (loadedUser.prompts && loadedUser.prompts.length) {
        $location.path('/updateuser');
        return;
      }

      if (opt_callback) {
        opt_callback(loadedUser);
      }
    };

    ApiService.getLoggedInUser().then(function(loadedUser) {
      handleUserResponse(loadedUser);
    }, function() {
      handleUserResponse({'anonymous': true});
    });
  };

  userService.isOrganization = function(name) {
    return !!userService.getOrganization(name);
  };

  userService.getOrganization = function(name) {
    if (!userResponse || !userResponse.organizations) { return null; }
    for (var i = 0; i < userResponse.organizations.length; ++i) {
      var org = userResponse.organizations[i];
      if (org.name == name) {
        return org;
      }
    }

    return null;
  };

  userService.isNamespaceAdmin = function(namespace) {
    if (namespace == userResponse.username) {
      return true;
    }

    var org = userService.getOrganization(namespace);
    if (!org) {
      return false;
    }

    return org.is_org_admin;
  };

  userService.isKnownNamespace = function(namespace) {
    if (namespace == userResponse.username) {
      return true;
    }

    var org = userService.getOrganization(namespace);
    return !!org;
  };

  userService.getNamespace = function(namespace) {
    var org = userService.getOrganization(namespace);
    if (org) {
      return org;
    }

    if (namespace == userResponse.username) {
      return userResponse;
    }

    return null;
  };

  userService.currentUser = function() {
    return userResponse;
  };

  // Update the user in the root scope.
  userService.updateUserIn($rootScope);

  return userService;
}]);
