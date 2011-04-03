#!/usr/bin/perl

# $Id: email2scapbook.pl,v 1.2 2011-04-03 18:03:33 ericblue76 Exp $
#
# Author: Eric Blue - http://eric-blue.com
# Project: Scrapbook - Email interface
# Description:  Enables webpages to be captured via Firefox Scrapbook plugin+POW via email
#
# Scapbook URL = https://addons.mozilla.org/en-us/firefox/addon/scrapbook/
# POW URL = https://addons.mozilla.org/en-us/firefox/addon/pow-plain-old-webserver/
#

use Net::IMAP::Client;
use URI::Find;
use LWP::UserAgent;
use Data::Dumper;
use URI::Escape;
use MIME::QuotedPrint;

use strict;

# Sender - will be verified (change to your email)
my $sender_email = 'sender@domain.com';

# Recipient email address for processing 
my $scrapbook_email = 'recipient+scrapbook@domain.com';

# Scrapbook URL - POW Server
my $scrapbook_url = "http://localhost:6670/scrapbook/";

# IMAP Folder where incoming requests go to
my $scrapbook_folder = "Scrapbook";

# IMAP Folder where process requests go to
my $processed_folder = "Processed";

my $imap = Net::IMAP::Client->new(
    server => 'imap.domain.com',
    user   => 'recipient@domain.com',
    pass   => 'password',
    ssl    => 1,
    port   => 993
) or die "Could not connect to IMAP server";

$imap->login                     or die( 'Login failed: ' . $imap->last_error );
$imap->select($scrapbook_folder) or die "Can't select to folder Scrapbook!\n";

my @messages = @{ $imap->search('ALL') };
print "Processing [", scalar(@messages), "] message(s)...\n";

foreach my $m (@messages) {

    print "Message ID = $m\n";
    my $summary   = $imap->get_summaries( [$m] );
    my $s         = @$summary[0];
    my $from      = $s->{from}[0];
    my $to        = $s->{to}[0];
    my $sender    = $from->{mailbox} . "@" . $from->{host};
    my $recipient = $to->{mailbox} . "@" . $to->{host};

    # Verify sender
    if ( $sender ne $sender_email ) {
        #warn "Message is not from $sender_email (From = $sender)\n";
       # next;
    }

    # Check that message in Scrapbook folder is expected recipient
    if ( $recipient ne $scrapbook_email ) {
        warn "Message is not for $scrapbook_email (To = $recipient)\n";
        next;
    }

    my $body_text;

    #print Dumper $imap->fetch( $m, "BODY[TEXT]" );

    # Fetch the plain BODY TEXT if the message isn't multipart (html+text)
    # In both cases decode quoted-printable transfer encoding to remove 3D and other chars
    
    if ( !defined( $s->{parts} ) ) {
        my $fhash = $imap->fetch( $m, "BODY[TEXT]" );
        $body_text = decode_qp($fhash->{'BODY[TEXT]'});
    }
    else {
        my $found_text = 0;
        my $part_id;
        foreach my $p ( @{ $s->{parts} } ) {
            if ( $p->{subtype} eq "plain" ) {
                $found_text = 1;
                $part_id    = $p->{part_id};
            }
        }

        if ( !$found_text ) {
            warn "Couldn't locate plain/text message\n";
            next;
        }

        my $body = $imap->get_parts_bodies( $m, [$part_id] );
        $body_text = decode_qp(${ $body->{1} });

    }
    print "Message = $body_text\n";

    my @urls;
    my $finder = URI::Find->new(
        sub {
            my ($url) = shift;
            push @urls, $url;
        }
    );
    $finder->find( \$body_text );

    if ( scalar(@urls) < 1 ) {
        warn "URL is missing!\n";
        $imap->delete_message($m);
        next;
    }

    # Simple check - use first URL in message body
    my $request_url = $urls[0];
    print "Request URL = $request_url\n";

    if ( $request_url !~ /^https?:\/\/[a-z0-9-\.]+\.[a-z]{2,4}\/?([^\s<>\#%"\,\{\}\\|\\\^\[\]`]+)?$/ ) {
        warn "Invalid URL: $request_url\n";
        $imap->delete_message($m);
        next;
    }

    my $ua       = LWP::UserAgent->new();
    my $escaped_url = "$scrapbook_url?url=" . uri_escape($request_url);
    print "Getting Scrapbook URL = $request_url\n";
    my $response = $ua->get($escaped_url);

    if ( !$response->is_success ) {

        # Firefox and the POW server aren't currently available
        # TODO - Put in logic to check for firefox PID and launch new process
        warn "Couldn't get URL!";
        next;
    }

    my $content = $response->content;
    #print "Content = $content\n";
    
    if ( $content =~ /SUCCESS/ ) {
        print "Success: Saved URL = $request_url\n";
        # Processing is done - delete message
        $imap->delete_message($m);

    }
    elsif ( ( $content =~ /ERROR/ ) ) {
        warn "Error: Couldn't save URL = $request_url\n";
        next;
    }
    else {
        warn "Unknown error while requesting URL = $request_url\n";
        next;
    }

}
