
# for testing test :)
# look at PolicyWeb and print id of activ elements

use lib 't';
use Selenium::Chrome;
use PolicyWeb::Init qw/$SERVER $port/;

PolicyWeb::Init::prepare_export();
PolicyWeb::Init::prepare_runtime_no_login();

my $driver =
  Selenium::Chrome->new(browser_name   => 'chrome',
                        proxy          => { proxyType => 'direct', },
                        base_url       => "http://$SERVER:$port",
                        default_finder => 'id',
                        javascript     => 1,
                       );

$driver->get('index.html');

eval {
    while (1) {
        print $driver->get_active_element()->get_attribute('id') . "\n";
        sleep 1;
    }
  }
  or print "whoopsi, or browser closed\n";

$driver->quit();