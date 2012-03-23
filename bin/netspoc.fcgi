#!/usr/local/bin/perl

use strict;
use warnings;
use FCGI;
use FCGI::ProcManager;
use JSON;
use CGI::Simple;
use CGI::Session;
use CGI::Session::Driver::file;
use Digest::MD5 qw/md5_hex/;
use String::MkPasswd qw(mkpasswd);
use Encode;
#use Data::Dumper;

use FindBin;
use lib $FindBin::Bin;
use Policy_Diff;

# Exportierte Funktionen
# - sub load_json_version($path, $version)
# - sub list_all_owners($version)
use JSON_Cache;


# Input from template files is encoded in utf8.
# Output is explicitly sent as utf8.
use open IN => ':utf8';

my $VERSION = ( split ' ',
 '$Id$' )[2];

sub usage {
    die "Usage: $0 CONFIG [:PORT | 0 [#PROC]]\n";
}

# Configuration data.
my $conf_file = shift @ARGV or usage();
my $listen = shift @ARGV;
my $nproc  = shift @ARGV;

$listen and ($listen =~ /^(?:[:]\d+|0)$/ or usage());
$nproc and ($nproc =~/^\d+$/ or usage());

$CGI::Session::Driver::file::FileName = "%s";

# Valid config options.
my %conf_keys = map { ($_ => 1) } 
qw(
   error_page
   netspoc_data
   noreply_address
   password_dir
   sendmail_command
   session_dir
   show_passwd_template
   verify_fail_template
   verify_mail_template
   verify_ok_template
   );

sub abort {
    my ($msg) = @_;
    die "$msg\n";
}

sub internal_err {
    my ($msg) = @_;
    abort "internal: $msg";
}

sub say {
    my ($msg) = @_;
    print "$msg\n";
}

sub errsay {
    my ($msg) = @_;
    print STDERR "$msg\n";
}

sub intersect {
    my @non_compl = @_;
    my $result;
    for my $element (@{pop @non_compl}) {
	$result->{$element} = $element;
    }
    for my $set (@non_compl) {
	my $intersection;
	for my $element (@$set) {
	    if($result->{$element}) {
		$intersection->{$element} = $element;
	    }
	}
	$result = $intersection;
    }
    return [ keys %$result ];
}
    
my $config;
sub load_config {
    open( my $fh, $conf_file ) or internal_err "Can't open $conf_file: $!";
    {
	local $/ = undef;
	$config = from_json(  <$fh>, { relaxed  => 1 } );
    }    
    my %required;
    for my $key (keys %conf_keys) {
        next if $conf_keys{$key} eq 'optional';
        defined $config->{$key} or abort "Missing key '$key' in $conf_file";
    }
    for my $key (keys %$config) {
        $conf_keys{$key} or abort("Invalid key '$key' in $conf_file");
    }
}

sub get_policy {

    # Read modification date of and policy number from file current/POLICY 
    # Content is: # pnnnnn #...
    my $policy_path = "$config->{netspoc_data}/current/POLICY";
    my ($date, $time) = split(' ', qx(date -r $policy_path '+%F %R'));
    my $policy = qx(cat $policy_path);
    $policy =~ m/^# (\S+)/ or abort "Can't find policy name in $policy_path";
    $policy = $1;
    return [ { current => 1,
	       policy => $policy,
	       date => $date,
	       time => $time,
	   }];
}

sub get_history {
    my ($cgi, $session) = @_;
    my $owner = $cgi->param('active_owner');
    my $current = get_policy()->[0];
    my $current_policy = $current->{policy};
    my @result = ($current);
    

    # Add data from RCS rlog output.
    # Parse lines of this format:
    # ...
    # ----------------------------
    # revision 1.4  ...
    # date: 2011-04-18 11:23:01+02; ...
    # <one or more lines of log message>
    # ----------------------------
    # ...
    # We take date, time and  first line of the log message.
    my $RCS_path = "$config->{netspoc_data}/RCS/owner/$owner/POLICY,v";
    if (-e $RCS_path) {
	my @rlog = qx(rlog -zLT $RCS_path);

	while (my $line = shift @rlog) {
	    my($date, $time) = ($line =~ /^date: (\S+) (\d+:\d+)/) or next;
	    my $policy = shift @rlog;
	    chomp $policy;

	    # If there wasn't added a new policy today, current policy
	    # is available duplicate in RCS.
	    next if $policy eq $current_policy;
	    push(@result, { policy => $policy,
			    date => $date,
			    time => $time,
			});
	}
    }
    return \@result;
}

my $selected_history;
sub select_history {
    my ($cgi, $history_needed) = @_;

    # Read requested version date from cgi paramter.
    if ($selected_history = $cgi->param('history')) {
	$history_needed or abort "Must not send parameter 'history'";
    }

    # Read current version tag from current/POLICY.
    else {
	$history_needed and abort "Missing parameter 'history'";
	$selected_history = get_policy()->[0]->{policy};
    }
}

my $cache;

sub load_json {
    my ($path) = @_;
    $cache->load_json_version($selected_history, $path);
}

sub get_objects {
    return load_json('objects');
}

sub get_no_nat_set {
    my ($owner) = @_;
    return load_json("owner/$owner/no_nat_set");
}

sub get_nat_obj {
    my ($obj_name, $no_nat_set) = @_;
    my $objects = get_objects();
    my $obj = $objects->{$obj_name};
    if (my $href = $obj->{nat} and $no_nat_set) {
	for my $tag (keys %$href) {
	    next if $no_nat_set->{$tag};
	    my $nat_ip = $href->{$tag};
	    return { %$obj, ip => $nat_ip };
	}
    }
    return $obj;
}
    
sub get_nat_obj_list {
    my ($obj_names, $owner) = @_;
    my $no_nat_set = get_no_nat_set($owner);
    return [ map(get_nat_obj($_, $no_nat_set), @$obj_names) ];
}

sub get_any {
    my ($cgi, $session) = @_;
    my $owner = $cgi->param('active_owner');
    my $assets = load_json("owner/$owner/assets");
    my $any_names = $assets->{any_list};
    return get_nat_obj_list($any_names, $owner);
}

sub get_networks {
    my ($cgi, $session) = @_;
    my $owner  = $cgi->param('active_owner');
    my $chosen = $cgi->param('chosen_networks');
    my $assets = load_json("owner/$owner/assets");
    my $network_names = $assets->{network_list};
    if ( $chosen ) {
	my $chosen_networks = [ split /,/, $chosen ];
	$network_names = intersect( $chosen_networks, $network_names  );
    }
    return get_nat_obj_list( $network_names, $owner );
}

sub get_hosts {
    my ($cgi, $session) = @_;
    my $net_name = $cgi->param('network') or abort "Missing param 'network'";
    my $owner = $cgi->param('active_owner');
    my $assets = load_json("owner/$owner/assets");
    my $child_names = $assets->{net2childs}->{$net_name};
    return get_nat_obj_list($child_names, $owner);
}

####################################################################
# Services, rules, users
####################################################################

sub service_list {
    my ($cgi, $session) = @_;
    my $owner    = $cgi->param('active_owner');
    my $relation = $cgi->param('relation');
    my $search   = $cgi->param('search_string');
    my $chosen   = $cgi->param('chosen_networks');
    my $lists    = load_json("owner/$owner/service_lists");
    my $assets   = load_json("owner/$owner/assets");
    my $services = load_json('services');
    my $copy;
    my $plist;

    # Make a real copy not a reference.
    map { $copy->{$_} = $lists->{$_} } keys %$lists;

    # Are we in restricted mode with only selected networks?
    if ( $chosen ) {

	# Reset user and owner on copy of $lists.
	$copy->{user}  = [];
	$copy->{owner} = [];

	# Untaint: Intersect chosen networks with all networks
	# within area of ownership.
	my $chosen_networks = [ split /,/, $chosen ];
	my $network_names = $assets->{network_list};
	$network_names = intersect( $chosen_networks,
				    $network_names  );

	# Only collect services that are relevant for chosen
	# networks stored in $network_names.
      SERVICE:
	for my $pname ( sort map(@$_, @{$lists}{qw(owner user)}) ) {
	    my $users = get_users_for_owner_and_service( $owner, $pname );
	    for my $rule ( @{$services->{$pname}->{rules}} ) {
		my $src = $rule->{src};
		my $dst = $rule->{dst};
		for my $network ( @$network_names ) {
                    my %children;
		    map { $children{$_} = 1 } @{$assets->{net2childs}->{$network}};
		    if ( $relation && $relation eq 'user' && $users ) {
			# Check if network or any of its contained resources
			# can be found in user-data-structure.
			for my $user ( @$users ) {
			    my $uname = $user->{name};
			    if ( $uname eq $network || $children{$uname} ) {
				push @{$copy->{user}}, $pname;
				next SERVICE;
			    }
			}
		    }
		    else {  # Only check src and dst for own services.
			my $src_match = grep { $_ eq $network } @$src;
			my $dst_match = grep { $_ eq $network } @$dst;
			if ( $src_match > 0 || $dst_match > 0 ) {
			    push @{$copy->{owner}}, $pname;
			    next SERVICE;
			}
			for my $s ( @$src ) {
			    if ( $children{$s} ) {
				push @{$copy->{owner}}, $pname;
				next SERVICE;
			    }
			} 
			for my $d ( @$dst ) {
			    if ( $children{$d} ) {
				push @{$copy->{owner}}, $pname;
				next SERVICE;
			    }
			} 
		    }
		}
	    }
	}
    }

    # $plist is filled here but is overridden in code
    # handling search, IF we are in search mode.
    if ( not $relation ) {
	$plist = [ sort map(@$_, @{$copy}{qw(owner user visible)}) ]
    }
    else {
	$plist = $copy->{$relation};
    }

    # Searching services?
    if ( $search ) {

	# Strip leading and trailing whitespaces.
	$search =~ s/^\s+//;
	$search =~ s/\s+$//;

	# Search case-sensitive?
	if ( !$cgi->param('search_case_sensitive') ) {
	    $search = "(?i)$search";
	}

	# Reset $plist, it gets filled with search results below.
	$plist = [];
	my @search_in = ();
	if ( $cgi->param( 'search_own' ) ) {
	    push @search_in, 'owner';
	}
	if ( $cgi->param( 'search_used' ) ) {
	    push @search_in, 'user';
	}
	if ( $cgi->param( 'search_visible' ) ) {
	    push @search_in, 'visible';
	}
	my $search_plist = [ sort map(@$_, @{$copy}{ @search_in } ) ];

      SERVICE:
	for my $sname ( @$search_plist ) {

	    # Check if service name itself contains $search.
	    if ( $sname =~ /$search/ ) {
		push @$plist, $sname;
		next SERVICE;
	    }

	    if ( $cgi->param( 'search_in_rules' ) ) {
		my %lookup = (
			      'src'  => 'dst',
			      'dst'  => 'src',
			      'both' => 'both'
			      );
		# Get rules for current owner and service.
		my $rules = get_rules_for_owner_and_service( $owner, $sname );
		if ( $rules ) {
		    for my $r ( @$rules ) {
			# Search in src or dst.
			for my $item ( @{$r->{$lookup{$r->{has_user}}}} ) {
			    if ( $item =~ /$search/ ) {
				push @$plist, $sname;
				next SERVICE;
			    }
			}
			# Search in srv.
			for my $item ( @{$r->{srv}} ) {
			    if ( $item =~ /$search/ ) {
				push @$plist, $sname;
				next SERVICE;
			    }
			}
		    }
		}
	    }
	    if ( $cgi->param( 'search_in_user' ) ) {
		my $users = get_users_for_owner_and_service( $owner, $sname );
		if ( $users ) {
		    for my $u ( @$users ) {
			if ( $u->{ip}  &&  $u->{ip} =~ /$search/ ) {
			    push @$plist, $sname;
			    next SERVICE;
			}
			elsif ( $u->{name}  &&  $u->{name} =~ /$search/ ) {
			    push @$plist, $sname;
			    next SERVICE;
			}
			elsif ( $u->{owner}  &&  $u->{owner} =~ /$search/ ) {
			    push @$plist, $sname;
			    next SERVICE;
			}
		    }
		}
	    }
	    if ( $cgi->param( 'search_in_desc' ) ) {
		if ( my $desc = $services->{$sname}->{details}->{description} ) {
		    if ( $desc =~ /$search/ ) {
			push @$plist, $sname;
			next SERVICE;
		    }
		}
	    }
	}
    }

    return [ map {
	my $hash = { name => $_, %{ $services->{$_}->{details}} };

	# Convert [ owner, .. ] to "owner, .."
	$hash->{owner} = join(',', @{ $hash->{owner} });
	$hash;
    } @$plist ];
}

sub get_users_for_owner_and_service {
    my ( $owner, $sname ) = @_;
    # Get user for current owner and service.
    my $path = "owner/$owner/users";
    my $sname2users = load_json( $path );
    
    # Empty user list is not exported intentionally.
    my $user_names = $sname2users->{$sname} || [];
    return get_nat_obj_list($user_names, $owner);
}

sub get_rules_for_owner_and_service {
    my ( $owner, $sname ) = @_;
    my $lists = load_json("owner/$owner/service_lists");

    # Check if owner is allowed to access this service.
    $lists->{hash}->{$sname} or abort "Unknown service '$sname'";
    my $services = load_json('services');

    # Rules reference objects by name.
    # Build copy with 
    # - names substituted by objects
    # - IP addresses in object with NAT applied.
    my $no_nat_set = get_no_nat_set($owner);
    my $rules = $services->{$sname}->{rules};
    my $crules;
    for my $rule (@$rules) {
	my $crule = { %$rule };
	for my $what (qw(src dst)) {
	    $crule->{$what} = 
		[ map((get_nat_obj($_, $no_nat_set))->{ip},
		      @{ $rule->{$what} }) ];
	}
	push @$crules, $crule;
    }
    return $crules;
}

sub get_rules {
    my ($cgi, $session) = @_;
    my $owner = $cgi->param('active_owner');
    my $sname = $cgi->param('service') or abort "Missing parameter 'service'";
    return get_rules_for_owner_and_service( $owner, $sname );
}

sub get_users {
    my ($cgi, $session) = @_;
    my $owner = $cgi->param('active_owner');
    my $sname = $cgi->param('service') or abort "Missing parameter 'service'";
    return get_users_for_owner_and_service( $owner, $sname );
}

my %text2css = ( '+' => 'icon-add',
                 '-' => 'icon-delete',
                 '!' => 'icon-page_edit',
                 );

my %toplevel_sort = (objects => 1, services => 2, );

sub get_diff {
    my ($cgi, $session) = @_;
    my $owner = $cgi->param('active_owner');
    my $version = $cgi->param('version') or 
        abort "Missing parameter 'version'";
    my $changed = 
        Policy_Diff::compare($cache, $version, $selected_history, $owner);
    return undef if not $changed;

    # Convert to ExtJS tree.
    # Node: Hash with attributes "text" and 
    # - either "leaf: true"
    # - or "children: [ .. ]"
    # Add css class to special +,-,! nodes.
    # Toplevel: array of nodes
    my $node = sub {
        my ($text, $childs) = @_;
        my $result = {};
        if (my $css = $text2css{$text}) {
            $result->{iconCls} = $css;
        }
        else {
            $result->{text} = $text;
        }
        if ($childs) {
            $result->{children} = $childs;
        }
        else {
            $result ->{leaf} = JSON::true;
        }
        return $result;
    };
    my $convert;
    $convert = sub {
        my ($in) = @_;
        my $type = ref($in);
        if (not $type) {
            return $node->($in);
        }
        elsif ($type eq 'HASH') {
            my @result;
            for my $key (sort keys %$in) {
                my $val = $convert->($in->{$key});
                push @result, $node->($key, 
                                      ref($val) eq 'ARRAY' ? $val : [$val]);
            }
            return \@result;
        }
        elsif ($type eq 'ARRAY') {
            return [ map { $convert->($_) } @$in ];
        }
    };
    return
        [ sort { ($toplevel_sort{$a->{text}} || 999) <=> ($toplevel_sort{$b->{text}} || 999) }
          @{ $convert->($changed) } ];
}

####################################################################
# Save session data
####################################################################

my %saveparam = ( owner => 1 );

sub set_session_data {
    my ($cgi, $session) = @_;
    for my $param ($cgi->param()) {
	$saveparam{$param} or abort "Invalid param '$param'";
	my $val = $cgi->param($param);
	$session->param($param, $val);
    }
    return [];
}

####################################################################
# Email -> Admin -> Owner
####################################################################

# Get currently selected owner.
sub get_owner {
    my ($cgi, $session) = @_;
    if (my $active_owner = $session->param('owner')) {
	return [ { name => $active_owner } ];
    }
    else {
	return [];
    }
}

# Get list of all owners available for current email.
sub get_owners {
    my ($cgi, $session) = @_;
    my $email = $session->param('email');
    my $email2owners = load_json("email");
    return [ map({ name => $_}, @{ $email2owners->{$email} }) ];
}

# Get list of all emails for given owner.
sub get_emails {
    my ($cgi, $session) = @_;
    my $owner_name = $cgi->param('owner') or abort "Missing param 'owner'";
    if ($owner_name eq ':unknown') {
	return [];
    }
    return load_json("owner/$owner_name/emails");
}


####################################################################
# Send HTML as answer
####################################################################

sub read_template {
    my ($file) = @_;
    open(my $fh, $file) or internal_err "Can't open $file: $!";
    local $/ = undef;
    my $text = <$fh>;
    close $fh;
    $text;
}

# Do simple variable substitution.
# Use syntax of template toolkit.
sub process_template {
    my ($text, $vars) = @_;
    while (my ($key, $value) = each %$vars) {
	$text =~ s/\[% $key %\]/$value/g;
    }
    $text;
}

sub get_substituted_html {
    my ($file, $vars ) = @_;
    my $text = read_template($file);
    $text = process_template($text, $vars);
    $text;
}					 
   

####################################################################
# Register / reset password
####################################################################

sub send_verification_mail {
    my ($email, $url, $ip) = @_;
    my $text = read_template($config->{verify_mail_template});
    $text = process_template($text, { email => $email, 
				      url => $url, 
				      ip => $ip });
    my $sendmail = $config->{sendmail_command};

    # -t: read recipient address from mail text
    # -f: set sender address
    # -F: don't use sender full name
    open(my $mail, "|$sendmail -t -F '' -f $config->{noreply_address}") or 
	internal_err "Can't open $sendmail: $!";
    print $mail Encode::encode('UTF-8', $text);
    close $mail or warn "Can't close $sendmail: $!\n";
}

# Password is stored with CGI::Session using email as ID.
sub get_user_store {
    my ($email) = @_;
    new CGI::Session ('driver:file;id:static', $email, 
		      { Directory=> $config->{password_dir} } 
		      ) 
	or abort(CGI::Session->errstr());
			  
}

# Get / set password for user.
# New password is already encrypted in sub register below.
sub store_password {
    my ($email, $pass) = @_;
    my $pass_store = get_user_store($email);
    $pass_store->param('pass', $pass);
}

sub check_password  {
    my ($email, $pass) = @_;
    my $pass_store = get_user_store($email);
    $pass_store->param('pass') eq md5_hex($pass);
}

sub register {
    my ($cgi, $session) = @_;
    my $email = $cgi->param('email') or abort "Missing param 'email'";
    $email = lc $email;
    my $email2owners = load_json("email");
    $email2owners->{$email} or abort "Email address is not authorized";
    my $base_url = $cgi->param( 'base_url' ) 
	or abort "Missing param 'base_url' (Activate JavaScript)";
    check_attack($email);
    my $token = md5_hex(localtime, $email);
    my $pass = mkpasswd() or internal_err "Can't generate password";

    # Store encrypted password in session until verification.
    my $reg_data = { user => $email, pass => md5_hex($pass), token => $token };
    $session->expire('register', '1d');
    $session->param('register', $reg_data);
    my $url = "$base_url/verify?email=$email&token=$token";

    # Send remote address to the recipient to allow tracking of abuse.
    my $ip = $cgi->remote_addr();
    set_attack($email);
    send_verification_mail ($email, $url, $ip);
    return get_substituted_html($config->{show_passwd_template},
				{ pass => $cgi->escapeHTML($pass) });
}

sub verify {
    my ($cgi, $session) = @_;
    my $email = $cgi->param('email') or abort "Missing param 'email'";
    my $token = $cgi->param('token') or abort "Missing param 'token'";
    my $reg_data =  $session->param('register');
    if ($reg_data and
	$reg_data->{user} eq $email and
	$reg_data->{token} eq $token) 
    {
	store_password($email, $reg_data->{pass});
	$session->clear('register');
	return get_substituted_html($config->{verify_ok_template}, {})
    }
    else {
	return get_substituted_html($config->{verify_fail_template}, {});
    }
}					 
    
####################################################################
# Login
####################################################################

# Wait for 10, 20, .., 300 seconds after submitting wrong password.
sub set_attack {
    my ($email) = @_;
    my $store = get_user_store($email);
    my $wait = $store->param('login_wait') || 5;
    $wait *= 2;
    $wait = 300 if $wait > 300;
    $store->param('login_wait', $wait);
    $store->param('failed_time', time());
    $wait;
}

sub check_attack {
    my ($email) = @_;
    my $store = get_user_store($email);
    my $wait = $store->param('login_wait');
    return if not $wait;
    my $remain = $store->param('failed_time') + $wait - time();
    if ($remain > 0) {
	abort("Wait for $remain seconds after wrong password" );
    }
}

sub clear_attack {
    my ($email) = @_;
    my $store = get_user_store($email);
    $store->clear('login_wait');
}

sub login {
    my ($cgi, $session) = @_;
    logout($cgi, $session);
    my $email = $cgi->param('email') or abort "Missing param 'email'";
    $email = lc $email;
    my $email2owners = load_json("email");
    $email2owners->{$email} or abort "Email address is not authorized";
    my $pass = $cgi->param('pass') or abort "Missing param 'pass'";
    my $app_url = $cgi->param('app') or abort "Missing param 'app'";
    check_attack($email);
    if (not check_password($email, $pass)) {
	set_attack($email);
	abort "Login failed";
    }
    clear_attack($email);
    $session->param('email', $email);
    $session->clear('user');		# Remove old, now unused param.
    $session->expire('logged_in', '60m');
    $session->param('logged_in', 1);
    return $app_url;
}

sub logged_in {
    my ($session) = @_;
    return $session->param('logged_in');
}

# Validate active owner. 
# Email could be removed from any owner role at any time in netspoc data.
sub validate_owner {
    my ($cgi, $session, $owner_needed) = @_;
    if (my $active_owner = $cgi->param('active_owner')) {
	$owner_needed or abort abort "Must not send parameter 'active_owner'";
	my $email = $session->param('email');
	my $email2owners = load_json("email");
	grep { $active_owner eq $_ } @{ $email2owners->{$email} } or
	    abort "Invalid owner: $active_owner";
    } 
    else {
	$owner_needed and abort "Missing parameter 'active_owner'";
    }
}

sub logout {
    my ($cgi, $session) = @_;
    $session->clear('logged_in');
    return [];
}

# Find email address for current session.
# This program must ensure that $session->param('email') is only set
# if a user was successfully logged in at least once.
sub session_email {
    my ($cgi, $session) = @_;
    return $session->param('email') || '';
}

####################################################################
# Request handling
####################################################################

sub decode_params {
    my ($cgi) = @_;
    for my $param ($cgi->param()) {
	my $val =  Encode::decode('UTF-8', $cgi->param($param));
	$cgi->param($param, $val);
    }
}

my %path2sub =
    (

     # Default: user must be logged in, JSON data is sent.
     # - anon: anonymous user is allowed
     # - html: send html 
     # - redir: send redirect
     # - owner: valid owner and history must be given as cgi parameter
     # - create_cookie: create cookie if no cookie is available
     login         => [ \&login,         { anon => 1, redir => 1, 
					   create_cookie => 1, } ],
     register      => [ \&register,      { anon => 1, html  => 1, 
					   create_cookie => 1, } ],
     verify        => [ \&verify,        { anon => 1, html  => 1, } ],
     session_email => [ \&session_email, { anon => 1, html => 1, 
					   err_status => 500} ],
     get_policy    => [ \&get_policy,    { anon => 1, add_success => 1, } ],
     logout        => [ \&logout,        { add_success => 1, } ],
     get_owner     => [ \&get_owner,     { add_success => 1, } ],
     get_owners    => [ \&get_owners,    { add_success => 1, } ],
     set           => [ \&set_session_data, { add_success => 1, } ],
     get_history   => [ \&get_history,   { owner => 1, add_success => 1, } ],
     service_list  => [ \&service_list,  { owner => 1, add_success => 1, } ],
     get_emails    => [ \&get_emails,    { owner => 1, add_success => 1, } ],
     get_rules     => [ \&get_rules,     { owner => 1, add_success => 1, } ],
     get_users     => [ \&get_users,     { owner => 1, add_success => 1, } ],
     get_networks  => [ \&get_networks,  { owner => 1, add_success => 1, } ],
     get_hosts     => [ \&get_hosts,     { owner => 1, add_success => 1, } ],
     get_diff      => [ \&get_diff,      { owner => 1, } ],
      ); 

sub handle_request {
    my $cgi = CGI::Simple->new();
    my $flags = { html => 1};
    my $cookie;

    # Catch errors.
    eval {
	my $session = CGI::Session->load("driver:file", $cgi,
					 { Directory => 
					       $config->{session_dir} }
					 );
	decode_params($cgi);
	my $path = $cgi->path_info();
	$path =~ s:^/::;
	my $info = $path2sub{$path} or abort "Unknown path '$path'";
	(my $sub, $flags) = @$info;
	if ($session->is_empty()) {
	    if ($flags->{create_cookie}) {
		$session->new();
	    }
	    else {
		die "Cookies must be activated\n";
	    }
	}
	select_history($cgi, $flags->{owner});
	validate_owner($cgi, $session, $flags->{owner});
	$flags->{anon} or logged_in($session) or abort "Login required";
	$cookie = $cgi->cookie( -name    => $session->name,
				-value   => $session->id,
				-expires => '+1y' );
	my $data = $sub->($cgi, $session);
	if ($flags->{html}) {
	    print $cgi->header( -type => 'text/html',
				-charset => 'utf-8', 
				-cookie => $cookie);
	    print Encode::encode('UTF-8', $data);	    
	}
	elsif ($flags->{redir}) {
	    print $cgi->redirect( -uri => $data, 
				  -cookie => $cookie);
	}
	else {
            if ($flags->{add_success}) {
                if (ref $data eq 'ARRAY') {
                    $data = {
                        totalCount => scalar @$data,
                        records => $data
                        };
                }
                elsif ($data) {
                    $data = { data => $data, };
                }
                else {
                    $data = {};
                }
                $data->{success} = JSON::true;
            }
	    print $cgi->header( -type    => 'text/x-json',
				-charset => 'utf-8',
				-cookie  => $cookie);
	    print to_json($data, {utf8 => 1, pretty => 1});    
	}
    };
    if ($@) {
	my $msg = $@;
	$msg =~ s/\n$//;
	if ($flags->{html} or $flags->{redir}) {

	    # Don't use status 500 on all errors, because IE 
	    # doesn't show error page.
	    my $status = $flags->{err_status} || 200;
	    print $cgi->header( -status  => $status,
				-type    => 'text/html',
				-charset => 'utf-8',
				-cookie => $cookie);
	    print get_substituted_html($config->{error_page}, {msg => $msg});
	}
	else
	{
	    my $result = { success => JSON::false, msg => $msg };
	    print $cgi->header( -status  => 500,
				-type    => 'text/x-json',
				-charset => 'utf-8', );
	    print encode_json($result), "\n";
	}
    }
}

sub run {
    my ( %params ) = @_;

    # Read from STDIN by default.
    my $sock = 0;

    if ($params{listen}) {
	my $old_umask = umask;
	umask(0);
	$sock = FCGI::OpenSocket( $params{listen}, 100 )
	    or die "failed to open FastCGI socket; $!";
	umask($old_umask);
    }

    # Send STDERR to stdout or to the web server
    my $error = $params{keep_stderr} ? \*STDOUT : \*STDERR;

    my $request =
      FCGI::Request( \*STDIN, \*STDOUT, $error, \%ENV, $sock,
		     FCGI::FAIL_ACCEPT_ON_INTR ,
      );

    my $nproc = $params{nproc};
    my $proc_manager;
    if ($nproc) {
	$proc_manager = FCGI::ProcManager->new
	    (
	     {
		 n_processes => $params{nproc},
		 pid_fname   => $params{pidfile},
	     }
	     );
    }

    $nproc && $proc_manager->pm_manage();
    
    # Give each child its own RNG state.
    srand;

    while ( $request->Accept >= 0 ) {
        $nproc && $proc_manager->pm_pre_dispatch();
        $params{request_handler}->();
        $nproc && $proc_manager->pm_post_dispatch();
    }
}

####################################################################
# Start server
####################################################################

load_config();
$cache = JSON_Cache->new(netspoc_data => $config->{netspoc_data},
			 max_versions => 8);

# Tell parent that we have initialized successfully.
if (my $ppid = $ENV{PPID}) {
    print STDERR "Sending USR2 signal to $ppid\n";
    kill 'USR2', $ppid;
}

run (
     # - listen on Port or 
     # - read from STDIN when started by external proc manager
     listen => $listen,

     # Start FCGI::ProcManager with n processes.
     nproc => $nproc,

     request_handler => \&handle_request,
     );
     
