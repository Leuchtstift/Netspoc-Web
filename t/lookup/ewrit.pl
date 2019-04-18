
# for testing test :)
# look at PolicyWeb and run perl lines

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

print "Enter stuff to run as perl code\nctrl + D to exit\n>";

eval {
    my $input;
    while (chomp($input = <>)) {
        eval $input;
        if   ($@) { print "\n$@\n>"; }
        else      { print "\n>"; }
    }
};
if ($@) { print "bye bye\n"; }

$driver->shutdown_binary;